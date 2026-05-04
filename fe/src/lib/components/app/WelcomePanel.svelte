<script>
  import WelcomeSvg1 from './WelcomeSvg1.svelte'
  import WelcomeSvg2 from './WelcomeSvg2.svelte'
  import CusButton from '$lib/components/ui/CusButton.svelte'
</script>

<div class="welcome-panel w-full max-w-2xl px-6">
  <div class="text-center mb-10">
    <h1 class="welcome-headline font-serif text-3xl font-bold mb-3">
      NewsDigest
    </h1>
    <p class="welcome-subtitle text-sm text-text-secondary leading-relaxed">
      Free & Open Source · Tổng hợp tin tức cá nhân hóa với AI
    </p>
  </div>

  <div
    class="feature-card flex border border-border/30 rounded-2xl overflow-hidden divide-y divide-border/50 flex-col"
  >
    <!-- Card 1: text left, SVG right -->
    <div class="grid grid-cols-[2fr_3fr] bg-bg-2 overflow-hidden min-h-[200px]">
      <div class="flex flex-col justify-end p-6">
        <h3 class="text-base font-semibold text-text-main mb-1.5">Phím tắt</h3>
        <p class="text-[13px] leading-relaxed text-text-secondary m-0">
          Bạn có thể nhấn phím mũi tên trên bàn phím để chuyển nhanh tin tức
        </p>
      </div>
      <div
        class="flex bg-bg-1/50 border-l border-border/30 items-center justify-center p-6"
      >
        <WelcomeSvg1 />
      </div>
    </div>

    <!-- Card 2: SVG left, text right -->
    <div
      class="grid grid-cols-[3fr_2fr] bg-bg-2 overflow-hidden min-h-[200px]"
      style="animation-delay: 1.9s;"
    >
      <div
        class="flex bg-bg-1/50 border-r border-border/30 items-center justify-center p-6"
      >
        <WelcomeSvg2 />
      </div>
      <div class="flex flex-col justify-end p-6">
        <h3 class="text-base font-semibold text-text-main mb-1.5">
          Tự động hóa
        </h3>
        <p class="text-[13px] leading-relaxed text-text-secondary m-0">
          Tin tức được cập nhật mỗi 3 giờ · Tự động sửa lỗi mỗi 30 phút · Dọn
          dẹp dữ liệu cũ hàng ngày
        </p>
      </div>
    </div>
  </div>

  <div class="cta-row">
    <CusButton
      href="/sources"
      class="gap-1.5 px-4 py-2 text-sm font-medium text-text-secondary"
    >
      Quản lý nguồn tin
    </CusButton>
  </div>
</div>

<style>
  .welcome-headline {
    /* Gradient text setup */
    -webkit-text-fill-color: transparent;
    color: transparent;
    background-image: linear-gradient(
      90deg,
      hsl(var(--text-main)) 0 33.33%,
      #69bff9 33.33%,
      #b96af3 45%,
      #e9685e 52.67%,
      #f2ac3e 66.67%,
      transparent 66.67%,
      transparent
    );
    background-size: 300% 100%;
    background-position: 100% 0;
    -webkit-background-clip: text;
    background-clip: text;
    padding-bottom: 0.18em;

    /* Start hidden & blurred */
    opacity: 0;
    filter: blur(1px);

    /* Phase 1: gradient sweep + reveal, Phase 2: settle to main color */
    animation:
      headline-sweep 3s 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards,
      headline-reveal 1s 0.6s ease forwards,
      headline-settle 0.8s 3.5s ease forwards;
  }

  @keyframes headline-sweep {
    0% {
      background-position: 100% 0;
    }
    100% {
      background-position: 0% 0;
    }
  }

  @keyframes headline-reveal {
    0% {
      opacity: 0;
      filter: blur(1px);
    }
    100% {
      opacity: 1;
      filter: blur(0);
    }
  }

  @keyframes headline-settle {
    0% {
      -webkit-text-fill-color: transparent;
    }
    100% {
      -webkit-text-fill-color: hsl(var(--text-main));
    }
  }

  .welcome-subtitle {
    opacity: 0;
    transform: translateY(6px);
    animation: subtitle-fade 0.8s 1.25s ease forwards;
  }

  @keyframes subtitle-fade {
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .feature-card {
    opacity: 0;
    transform: translateY(8px);
    animation: subtitle-fade 0.6s 1.6s ease forwards;
  }

  .cta-row {
    display: flex;
    justify-content: center;
    margin-top: 1.25rem;
    opacity: 0;
    transform: translateY(6px);
    animation: subtitle-fade 0.6s 2.1s ease forwards;
  }
</style>
