export function subscribeHeaderScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("pageshow", onChange);
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("pageshow", onChange);
  };
}

export function headerIsScrolled() {
  return window.scrollY > 24;
}

export const headerServerSnapshot = () => false;
