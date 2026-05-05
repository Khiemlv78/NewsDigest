<script lang="ts">
  import { tick, onMount, untrack } from 'svelte'
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { filters } from '$lib/stores/articles.svelte'
  import { prefs, cycleFontSize } from '$lib/stores/prefs'
  import { Settings, X } from 'lucide-svelte'
  import type { Article } from '$lib/types'
  import { sources } from '$lib/stores/sources'
  import { api } from '$lib/api'
  import { marked } from 'marked'
  import CusButton from '$lib/components/ui/CusButton.svelte'
  import CusButtonTab from '$lib/components/ui/CusButtonTab.svelte'
  import { articleCache } from '$lib/stores/articleCache.svelte'
  import { readArticles } from '$lib/stores/readArticles.svelte'
  import SourceFilter from '$lib/components/app/SourceFilter.svelte'
  import MobileArticleSheet from '$lib/components/app/MobileArticleSheet.svelte'
  import PullToRefresh from '$lib/components/app/PullToRefresh.svelte'
  import WelcomePanel from '$lib/components/app/WelcomePanel.svelte'
  import DateNavigator from '$lib/components/app/DateNavigator.svelte'
  import MobileSettingsSheet from '$lib/components/app/MobileSettingsSheet.svelte'
  import ArticleListSkeleton from '$lib/components/app/ArticleListSkeleton.svelte'
  import DigestView from '$lib/components/app/DigestView.svelte'
  import ArticleListItem from '$lib/components/app/ArticleListItem.svelte'
  import ArticleDetail from '$lib/components/app/ArticleDetail.svelte'
  import ScrollToTopButton from '$lib/components/app/ScrollToTopButton.svelte'

  let { data } = $props()

  // ── Derived from cache store ─────────────────────────────────
  let articles = $derived(articleCache.articles)
  let digest = $derived(articleCache.digest)
  // loading: full network fetch with no cache (shows skeleton)
  // initializing: IDB check in progress (shows nothing — avoids flash)
  let loading = $derived(articleCache.loading || articleCache.initializing)

  // ── Mobile / Drawer state ──────────────────────────────────
  let drawerOpen = $state(false)
  let settingsSheetOpen = $state(false)
  // True while PullToRefresh indicator is visible → nav becomes transparent
  let ptrActive = $state(false)

  // Also fetch sources client-side
  async function fetchSources() {
    try {
      const res = await fetch(api('/api/sources'))
      const data = await res.json()
      $sources = data.sources ?? []
    } catch (e) {
      console.error('Failed to fetch sources', e)
    }
  }

  // Trigger on mount and when currentDate changes
  // Only track data.currentDate — do NOT re-run when articles/loading change
  $effect(() => {
    const date = data.currentDate
    if (browser) {
      untrack(() => articleCache.loadDate(date))
    }
  })

  onMount(() => {
    fetchSources()

    // PWA resume: detect when app comes back from background
    // Track what "today" was when the user last saw the page,
    // so we only auto-navigate if the calendar day actually rolled over
    // while the user was viewing today (not an intentionally chosen past date).
    let lastKnownToday = todayStr

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      clockTick = Date.now()

      const now = new Date()
      const currentTodayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

      if (
        currentTodayStr !== lastKnownToday &&
        data.currentDate === lastKnownToday
      ) {
        // The calendar day rolled over while the user was viewing "today" → navigate to the new today
        lastKnownToday = currentTodayStr
        goto('/', { invalidateAll: true })
      } else {
        lastKnownToday = currentTodayStr
        // Same day or user was viewing a past date → just refresh current view
        articleCache.forceRefresh(data.currentDate)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Update clock every minute to detect midnight transitions
    const tickInterval = setInterval(() => {
      clockTick = Date.now()
    }, 60_000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(tickInterval)
    }
  })

  // Reactive clock tick — re-evaluates todayStr periodically (see interval in onMount)
  let clockTick = $state(Date.now())

  let todayStr = $derived.by(() => {
    void clockTick
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })

  let isToday = $derived(data.currentDate === todayStr)

  let formattedDate = $derived.by(() => {
    const d = new Date(`${data.currentDate}T00:00:00`)
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
  })

  function goToDate(offset: number) {
    const current = new Date(`${data.currentDate}T00:00:00`)
    current.setDate(current.getDate() + offset)
    const y = current.getFullYear()
    const m = String(current.getMonth() + 1).padStart(2, '0')
    const d = String(current.getDate()).padStart(2, '0')
    const newDate = `${y}-${m}-${d}`
    const todayNow = new Date()
    const todayFormatted = `${todayNow.getFullYear()}-${String(todayNow.getMonth() + 1).padStart(2, '0')}-${String(todayNow.getDate()).padStart(2, '0')}`
    if (newDate === todayFormatted) {
      goto('/')
    } else {
      goto(`/?date=${newDate}`)
    }
  }

  let filteredArticles = $derived.by(() => {
    let result: Article[] = articles
    if (filters.sourceId) {
      result = result.filter((a) => a.source_id === filters.sourceId)
    }
    if (filters.tag) {
      result = result.filter((a) => {
        try {
          const tags: string[] = a.tags ? JSON.parse(a.tags) : []
          return tags.some((t) => t.toLowerCase() === filters.tag.toLowerCase())
        } catch {
          return false
        }
      })
    }
    if (filters.minHot > 0) {
      result = result.filter((a) => (a.hot_score ?? 0) >= filters.minHot)
    }
    return result
  })

  // ── Digest-scoped article list (for next/prev navigation) ───
  // Extract unique article IDs referenced in the digest text via <id:uuid> markers
  let digestArticleIds = $derived.by(() => {
    if (!digest?.summary_text) return []
    const matches = [...digest.summary_text.matchAll(/<id:([a-f0-9][a-f0-9,\s-]*)>/gi)]
    const seen = new Set<string>()
    return matches
      .flatMap((m) =>
        m[1]
          .split(',')
          .map((id) => id.trim())
          .filter((id) => /^[a-f0-9-]+$/.test(id)),
      )
      .filter((id) => {
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
  })

  // Articles present in the digest, ordered by their appearance in the digest text
  let digestArticles = $derived.by(() => {
    const map = new Map(articles.map((a) => [a.id, a]))
    return digestArticleIds
      .map((id) => map.get(id) ?? articles.find((a) => a.id.startsWith(id)))
      .filter((a): a is Article => !!a)
  })

  let sideView = $state<'list' | 'digest'>('list')

  // Navigation list: digest articles when viewing digest, filtered articles otherwise
  let navArticles = $derived(
    sideView === 'digest' ? digestArticles : filteredArticles,
  )

  let selectedArticle: Article | null = $state(null)

  // Current article index within navArticles (for disabled state of prev/next)
  let navIdx = $derived.by(() => {
    const sel = selectedArticle
    return sel ? navArticles.findIndex((a) => a.id === sel.id) : -1
  })

  // Auto-select first article when filter changes (desktop)
  let prevFilterKey = $state('')
  $effect(() => {
    const filterKey = `${filters.sourceId}|${filters.tag}|${filters.minHot}`
    const prev = untrack(() => prevFilterKey)
    if (filterKey !== prev && prev !== '') {
      untrack(() => {
        if (innerWidth >= 768 && filteredArticles.length > 0) {
          selectedArticle = filteredArticles[0]
        } else if (innerWidth >= 768) {
          selectedArticle = null
        }
      })
    }
    untrack(() => {
      prevFilterKey = filterKey
    })
  })

  let hasActiveFilter = $derived(!!filters.sourceId || !!filters.tag)
  let activeFilterLabel = $derived.by(() => {
    const parts: string[] = []
    if (filters.sourceId) {
      const name = $sources.find((s) => s.id === filters.sourceId)?.name
      if (name) parts.push(name)
    }
    if (filters.tag) parts.push(`#${filters.tag}`)
    return parts.join(' · ')
  })

  function clearFilters() {
    filters.sourceId = ''
    filters.tag = ''
  }

  // ── Filter ↔ Digest auto-switch ─────────────────────────────
  // Remember which view user was on before a filter was activated
  let viewBeforeFilter: 'list' | 'digest' | null = $state(null)
  let prevHadFilter = $state(false)
  $effect(() => {
    const active = hasActiveFilter
    const prev = untrack(() => prevHadFilter)
    if (active && !prev) {
      // Filter just activated → switch to list, remember old view
      untrack(() => {
        viewBeforeFilter = sideView
        sideView = 'list'
      })
    } else if (!active && prev) {
      // Filter just cleared → restore previous view
      untrack(() => {
        if (viewBeforeFilter) {
          sideView = viewBeforeFilter
          viewBeforeFilter = null
        }
      })
    }
    untrack(() => {
      prevHadFilter = active
    })
  })

  // State to track scroll preservation
  let lastScrollInfo = $state({ articleId: null as string | null })

  // ── Scroll container refs (desktop) ──────────────────────────
  // asideEl = left panel native scroll div (article list / digest)
  let asideEl = $state<HTMLElement | null>(null)

  /** Scroll the aside panel to the top instantly. */
  function scrollToTop(el: HTMLElement | null | undefined) {
    el?.scrollTo({ top: 0, behavior: 'instant' })
  }

  // automatically select the first article when articles load on desktop
  let innerWidth = $state(
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  )
  let mobileMode = $derived(innerWidth < 768)

  // Effect to scroll main panel to top when selectedArticle changes (desktop only)
  $effect(() => {
    const article = selectedArticle
    const isMobile = mobileMode
    if (article && !isMobile) {
      const prevId = untrack(() => lastScrollInfo.articleId)
      if (article.id !== prevId) {
        untrack(() => {
          lastScrollInfo = { articleId: article.id }
        })
        tick().then(() => {
          // The main content panel has no height constraint, so the body
          // is the actual scroll container on desktop — scroll it to top.
          window.scrollTo({ top: 0, behavior: 'instant' })
        })
      }
    }
  })

  let currentDatasetId = $state('')
  // First visit: show welcome panel instead of auto-selecting the first article (desktop only)
  let isFirstVisit = $state(true)

  $effect(() => {
    // Track only loading and currentDate — avoid tracking filteredArticles directly
    // to prevent re-running when article content changes
    const isLoading = loading
    const date = data.currentDate
    if (!isLoading) {
      untrack(() => {
        if (date !== currentDatasetId) {
          currentDatasetId = date
          if (innerWidth >= 768 && !isFirstVisit) {
            if (filteredArticles.length > 0) {
              selectedArticle = filteredArticles[0]
            } else {
              selectedArticle = null
            }
          } else if (innerWidth < 768) {
            selectedArticle = null
          }
          // Reset scroll for both panels when date changes (desktop only)
          if (!mobileMode) {
            tick().then(() => {
              window.scrollTo({ top: 0, behavior: 'instant' })
              scrollToTop(asideEl)
            })
          }
        }
      })
    }
  })

  function selectArticle(a: Article) {
    selectedArticle = a
    isFirstVisit = false
    void readArticles.markRead(a)
    if (mobileMode) drawerOpen = true
  }

  function goToPrevArticle() {
    if (!selectedArticle || navArticles.length === 0) return
    const idx = navArticles.findIndex((a) => a.id === selectedArticle!.id)
    if (idx > 0) {
      const article = navArticles[idx - 1]
      selectedArticle = article
      void readArticles.markRead(article)
    }
  }

  function goToNextArticle() {
    if (!selectedArticle || navArticles.length === 0) return
    const idx = navArticles.findIndex((a) => a.id === selectedArticle!.id)
    if (idx < navArticles.length - 1) {
      const article = navArticles[idx + 1]
      selectedArticle = article
      void readArticles.markRead(article)
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && drawerOpen) {
      e.preventDefault()
      drawerOpen = false
      return
    }
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    // If WelcomePanel is showing (no article selected on desktop), dismiss it
    // by selecting the first article when any shortcut key is pressed
    if (
      isFirstVisit &&
      !selectedArticle &&
      !mobileMode &&
      navArticles.length > 0
    ) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        selectArticle(navArticles[0])
        return
      }
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goToPrevArticle()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      goToNextArticle()
    }
  }

  function getSourceName(id: string) {
    return $sources.find((s) => s.id === id)?.name || 'Unknown'
  }

  // Parse digest summary_text: replace <id:...> with clickable article anchors.
  // Handles both single IDs and comma-separated multi-ID tags emitted by the AI,
  // e.g. <id:ef037f04, b197daac, 65490e6d> → 3 separate source buttons.
  let parsedDigestHtml = $derived.by(() => {
    if (!digest?.summary_text) return ''
    const processed = digest.summary_text.replace(
      /<id:([a-f0-9][a-f0-9,\s-]*)>/gi,
      (_match: string, ids: string) => {
        return ids
          .split(',')
          .map((id) => id.trim())
          .filter((id) => /^[a-f0-9-]+$/.test(id))
          .map((id) => `<button class="digest-article-ref" data-article-id="${id}">source</button>`)
          .join('')
      },
    )
    return marked.parse(processed) as string
  })

  function handleDigestClick(e: MouseEvent) {
    const target = (e.target as HTMLElement).closest(
      '.digest-article-ref',
    ) as HTMLElement | null
    if (!target) return
    const articleId = target.dataset.articleId
    if (!articleId) return
    // Exact match first, then prefix fallback (safety net for short IDs)
    const article =
      articles.find((a) => a.id === articleId) ??
      articles.find((a) => a.id.startsWith(articleId))
    if (article) selectArticle(article)
  }

  $effect(() => {
    if (!mobileMode && drawerOpen) {
      drawerOpen = false
    }
  })
</script>

<svelte:window bind:innerWidth onkeydown={handleKeydown} />

<svelte:head>
  <title>NewsDigest - {formattedDate}</title>
</svelte:head>

<!-- ═══════════════ MOBILE LAYOUT ═══════════════ -->
<div class="md:hidden">
  <div
    class="fixed top-0 left-2 right-2 h-6 pointer-events-none bg-linear-to-b from-10% from-bg-1 to-bg-1/0 z-40"
  ></div>
  <div class="mobile-layout relative bg-bg-1">
    <!-- Mobile Top Header / Navigator -->
    <nav
      class="flex justify-between px-4 py-6"
      style="opacity: {ptrActive ? 0 : 1}; pointer-events: {ptrActive
        ? 'none'
        : 'auto'}; transition: opacity 0.2s ease;"
    >
      <DateNavigator
        {isToday}
        onPrev={() => goToDate(-1)}
        onNext={() => goToDate(1)}
        class="size-12"
      />
      <CusButton
        onclick={() => (settingsSheetOpen = true)}
        class="size-12"
        aria-label="Cài đặt"
        title="Cài đặt"
      >
        <Settings size={18} />
      </CusButton>
    </nav>

    <div
      class="fixed z-40 flex gap-2 justify-between bottom-0 px-8 pb-8 pt-4 w-full bg-linear-to-t from-bg-1 to-bg-1/0"
    >
      <CusButtonTab
        value={sideView !== 'digest'}
        onchange={(v) => {
          sideView = v ? 'list' : 'digest'
        }}
        tab1Label="News"
        tab2Label="Digest"
        initialTabWidth={69}
      />
      <SourceFilter {articles} size="md" />
    </div>

    <!-- Back to top (mobile) — hovers above bottom bar on right side -->
    <ScrollToTopButton
      onScrollToTop={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      class="fixed bottom-24 right-8"
    />

    <h2 class="text-2xl mb-8 font-serif text-text-main text-center font-bold">
      {formattedDate}
    </h2>

    <!-- Active filter bar (mobile) -->
    {#if hasActiveFilter}
      <div class="flex text-lg items-center gap-2 px-4 py-2">
        <span class="text-text-main font-bold truncate"
          >{activeFilterLabel}</span
        >
        <span class="ml-2 text-text-secondary tabular-nums shrink-0"
          >{filteredArticles.length}</span
        >
        <CusButton
          onclick={clearFilters}
          class="ml-auto size-12 sm:size-8 shrink-0"
        >
          <X size={20} />
        </CusButton>
      </div>
    {/if}

    <!-- Mobile Article List / Digest (body scroll) -->
    <PullToRefresh
      onRefresh={() => articleCache.forceRefresh(data.currentDate)}
      onIndicatorChange={(v) => (ptrActive = v)}
      disabled={loading}
    >
      <div class="mobile-content" style="font-size: var(--font-size-base);">
        {#if loading}
          <ArticleListSkeleton />
        {:else if sideView === 'digest'}
          <DigestView
            {digest}
            parsedHtml={parsedDigestHtml}
            onArticleClick={handleDigestClick}
            class="pb-16"
          />
        {:else}
          <div class="flex flex-col gap-8 pb-24">
            {#each filteredArticles as article (article.id)}
              <ArticleListItem
                {article}
                sourceName={getSourceName(article.source_id)}
                isRead={readArticles.isRead(article)}
                onclick={() => selectArticle(article)}
              />
            {/each}
            {#if filteredArticles.length === 0}
              <div
                class="text-sm text-zinc-500 py-10 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl"
              >
                Không có bài viết nào trong ngày này.
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </PullToRefresh>
  </div>

  <MobileArticleSheet
    open={drawerOpen}
    {selectedArticle}
    filteredArticles={navArticles}
    onPrev={goToPrevArticle}
    onNext={goToNextArticle}
    onClose={() => {
      drawerOpen = false
    }}
  />

  <MobileSettingsSheet
    open={settingsSheetOpen}
    onClose={() => {
      settingsSheetOpen = false
    }}
  />
</div>

<!-- ═══════════════ DESKTOP LAYOUT ═══════════════ -->
<div class="hidden md:contents">
  <div class="flex mx-auto max-w-340 sm:px-6">
    <aside class="h-svh sticky top-0 border-r w-88 lg:w-108 flex flex-col">
      <!-- Top Header / Navigator -->
      <nav class="absolute z-10 flex justify-between px-6 top-6 left-0 right-0">
        <DateNavigator
          {isToday}
          onPrev={() => goToDate(-1)}
          onNext={() => goToDate(1)}
          class="size-8"
        />
        <div class="flex gap-2">
          <CusButtonTab
            value={sideView !== 'digest'}
            onchange={(v) => {
              sideView = v ? 'list' : 'digest'
              tick().then(() => scrollToTop(asideEl))
            }}
            tab1Label="News"
            tab2Label="Digest"
            initialTabWidth={69}
          />
          <SourceFilter {articles} size="sm" />
        </div>
      </nav>
      <div
        class="left-0 z-5 absolute right-2.5 top-0 h-24"
        style="background: linear-gradient(to bottom, var(--color-bg-1) 10%, transparent);"
      ></div>
      <!-- Aside Content: Digest or Article List -->
      <!-- Back to top (desktop aside panel) -->
      <ScrollToTopButton
        scrollTarget={asideEl}
        onScrollToTop={() => scrollToTop(asideEl)}
        class="absolute bottom-6 right-4"
      />

      <div
        bind:this={asideEl}
        class="aside-scroll px-6 py-20 flex-1 overflow-y-auto overflow-x-hidden"
        style="font-size: var(--font-size-base);"
      >
        <!-- Title -->
        <h2
          class="text-2xl mb-8 font-serif text-text-main text-center font-bold"
        >
          {formattedDate}
        </h2>
        <!-- Active filter bar (desktop) -->
        {#if hasActiveFilter}
          <div class="flex items-center gap-2 mb-8">
            <span class="text-sm text-text-main font-bold truncate"
              >{activeFilterLabel}</span
            >
            <span class="text-xs ml-2 text-text-secondary tabular-nums shrink-0"
              >{filteredArticles.length}</span
            >
            <CusButton onclick={clearFilters} class="size-8 ml-auto shrink-0">
              <X size={16} />
            </CusButton>
          </div>
        {/if}
        {#if loading}
          <ArticleListSkeleton />
        {:else if sideView === 'digest'}
          <DigestView
            {digest}
            parsedHtml={parsedDigestHtml}
            onArticleClick={handleDigestClick}
          />
        {:else}
          <div class="flex flex-col gap-8">
            {#each filteredArticles as article (article.id)}
              <ArticleListItem
                {article}
                sourceName={getSourceName(article.source_id)}
                isRead={readArticles.isRead(article)}
                isSelected={selectedArticle?.id === article.id}
                showIndicator
                onclick={() => selectArticle(article)}
              />
            {/each}
            {#if filteredArticles.length === 0}
              <div
                class="text-sm text-zinc-500 py-10 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl"
              >
                Không có bài viết nào trong ngày này.
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </aside>
    <main
      class="flex-1 py-6 md:px-10 xl:px-16 main-scroll max-w-[55rem]"
      style="background-color: var(--color-bg-2);"
    >
      {#if selectedArticle}
        <ArticleDetail
          article={selectedArticle}
          {navIdx}
          navTotal={navArticles.length}
          darkMode={$prefs.darkMode}
          onPrev={goToPrevArticle}
          onNext={goToNextArticle}
          onToggleTheme={() => ($prefs.darkMode = !$prefs.darkMode)}
          onCycleFontSize={() =>
            ($prefs.fontSize = cycleFontSize($prefs.fontSize))}
        />
      {:else}
        <div class="h-full flex py-13 justify-center">
          <WelcomePanel />
        </div>
      {/if}
    </main>
  </div>
</div>
