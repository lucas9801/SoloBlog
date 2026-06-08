const header = document.querySelector(".site-header");
let lastScrollY = window.scrollY;
let ticking = false;

function updateHeaderVisibility() {
  if (!header) return;

  const currentY = Math.max(0, window.scrollY);
  const scrollingDown = currentY > lastScrollY;
  const delta = Math.abs(currentY - lastScrollY);

  if (currentY < 80) {
    header.classList.remove("is-hidden");
  } else if (delta > 6 && scrollingDown) {
    header.classList.add("is-hidden");
  } else if (delta > 6 && !scrollingDown) {
    header.classList.remove("is-hidden");
  }

  lastScrollY = currentY;
  ticking = false;
}

window.addEventListener(
  "scroll",
  () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateHeaderVisibility);
  },
  { passive: true }
);

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy-rss]");
  if (!button) return;

  const url = button.dataset.copyRss;
  if (!url) return;

  try {
    await navigator.clipboard.writeText(url);
    const previous = button.textContent;
    button.textContent = "已复制";
    window.setTimeout(() => {
      button.textContent = previous;
    }, 1600);
  } catch {
    window.location.href = url;
  }
});
