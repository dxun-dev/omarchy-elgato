// Animate once on entry. Content stays visible without JavaScript or motion support.
export function initReveals() {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (
    motion.matches ||
    !('IntersectionObserver' in window) ||
    !Element.prototype.animate
  ) {
    return;
  }

  const animations = new Map();
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      for (const { target } of visible) {
        observer.unobserve(target);
        if (motion.matches || target.contains(document.activeElement)) continue;

        // Stagger only siblings entering together, keeping later scroll reveals immediate.
        const group = target.closest('[data-reveal-group]');
        const siblings = visible.filter(
          (entry) =>
            group && entry.target.closest('[data-reveal-group]') === group,
        );
        const delay = Math.min(
          Math.max(
            0,
            siblings.findIndex((entry) => entry.target === target),
          ) * 65,
          195,
        );
        const animation = target.animate(
          [
            { opacity: 0, translate: '0 12px' },
            { opacity: 1, translate: '0 0' },
          ],
          {
            duration: 520,
            delay,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            fill: 'backwards',
          },
        );
        animations.set(target, animation);
        animation.finished.then(
          () => animations.delete(target),
          () => animations.delete(target),
        );
      }
    },
    { threshold: 0, rootMargin: '0px 0px -24px 0px' },
  );

  document
    .querySelectorAll('[data-reveal]')
    .forEach((element) => observer.observe(element));

  // Keyboard navigation and changing motion preferences must expose content immediately.
  document.addEventListener('focusin', (event) => {
    for (const [element, animation] of animations) {
      if (element.contains(event.target)) animation.cancel();
    }
  });
  motion.addEventListener('change', () => {
    if (!motion.matches) return;
    observer.disconnect();
    for (const animation of animations.values()) animation.cancel();
    animations.clear();
  });
}
