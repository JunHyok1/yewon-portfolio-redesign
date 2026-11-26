const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Email links: rebuild the address from the reversed data attributes (keeps it away from scrapers). */
(() => {
  const rev = (s) => s.split('').reverse().join('');
  document.querySelectorAll('a.js-email[data-u][data-d]').forEach((a) => {
    a.href = 'mailto:' + rev(a.dataset.u) + '@' + rev(a.dataset.d);
  });
})();

/* Nav: highlight the section in view and slide one underline under it. */
(() => {
  const links = [...document.querySelectorAll('.nav-list a[href^="#"]')];
  const bar = document.querySelector('.nav-indicator');
  if (!links.length || !bar) return;
  const box = bar.parentElement;
  const sections = links.map((a) => document.querySelector(a.hash)).filter(Boolean);
  let queued = false;
  function place(a) {
    if (!a) { bar.classList.remove('on'); return; }
    const r = a.getBoundingClientRect(), b = box.getBoundingClientRect();
    bar.style.width = r.width + 'px';
    bar.style.transform = `translateX(${r.left - b.left}px)`;
    bar.classList.add('on');
  }
  // A nav click wins only while the scroll it started is running; once scrolling stops (or anything
  // else moves the page, e.g. "Back to top") the underline follows the scroll position again.
  let clicked = null, settle = 0;
  const release = () => { if (clicked) { clicked = null; queue(); } };
  links.forEach((a) => a.addEventListener('click', () => { clicked = document.querySelector(a.hash); update(); }));
  document.addEventListener('click', (e) => { const a = e.target.closest('a[href^="#"]'); if (a && !links.includes(a)) release(); });
  addEventListener('scroll', () => { if (clicked) { clearTimeout(settle); settle = setTimeout(release, 150); } }, { passive: true });
  addEventListener('wheel', release, { passive: true });
  addEventListener('touchstart', release, { passive: true });
  addEventListener('keydown', (e) => { if (/^(Arrow|Page|Home|End| )/.test(e.key)) release(); });
  function triggers() {
    // Scroll position at which each section becomes current. Sections near the end can never reach
    // the top of the window, so they share the remaining scroll distance evenly instead of being skipped.
    const max = document.documentElement.scrollHeight - innerHeight;
    const line = innerHeight * 0.4;   // a section is current once its top passes 40% of the window
    const raw = sections.map((s) => s.getBoundingClientRect().top + scrollY - line);
    const firstLate = raw.findIndex((v) => v > max - 1);
    if (firstLate === -1) return raw;
    const start = firstLate > 0 ? Math.min(raw[firstLate - 1], max) : 0;
    const late = raw.length - firstLate;
    // e.g. two late sections: one takes over a third of the way down the remaining distance, the last at two thirds
    return raw.map((v, i) => i < firstLate ? v : start + (max - start) * ((i - firstLate + 1) / (late + 1)));
  }
  function update() {
    queued = false;
    const t = triggers();
    let current = null;
    t.forEach((v, i) => { if (scrollY >= v - 1) current = sections[i]; });
    if (clicked) current = clicked;
    let active = null;
    for (const a of links) {
      const on = !!current && a.hash === '#' + current.id;
      a.classList.toggle('active', on);
      if (on) { a.setAttribute('aria-current', 'location'); active = a; } else a.removeAttribute('aria-current');
    }
    place(active);
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  document.fonts.ready.then(update);
  update();
})();

/* Page-transition direction is set by the small inline script in <head> (it must run before first render). */

/* Going back from a case study lands exactly where the reader was on the home page. */
(() => {
  if (location.pathname === '/') {
    document.querySelectorAll('a.row').forEach((a) => a.addEventListener('click', () => sessionStorage.setItem('home-y', String(scrollY))));
    return;
  }
  const back = document.querySelector('.case-head a[data-dir="back"]');
  if (!back) return;
  back.addEventListener('click', (e) => {
    const ref = document.referrer && new URL(document.referrer);
    if (ref && ref.origin === location.origin && ref.pathname === '/' && history.length > 1) {
      e.preventDefault(); history.back();                       // the browser restores the exact position
    } else if (sessionStorage.getItem('home-y') !== null) {
      e.preventDefault(); sessionStorage.setItem('home-restore', '1'); location.assign('/');
    }                                                           // otherwise: /#row-x (the card itself)
  });
})();

/* Smooth scrolling for in-page links only, never for the jump that happens on arrival. */
addEventListener('load', () => requestAnimationFrame(() => document.documentElement.classList.add('smooth')));

/* Scroll reveal. Skipped when arriving at a specific spot (/#row-x, back/forward) so the card the
   image flies back to is never hidden, and anything on screen at load is left alone. */
(() => {
  if (reduceMotion || !('IntersectionObserver' in window)) return;
  const nav = performance.getEntriesByType('navigation')[0];
  if (location.hash || (nav && nav.type === 'back_forward')) return;

  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      en.target.classList.add('in');
      io.unobserve(en.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });

  const targets = document.querySelectorAll('.section-title, .row, .block, .events li, .gallery figure, .pager');
  const fold = innerHeight;
  const siblingIndex = new Map();
  targets.forEach((el) => {
    if (el.getBoundingClientRect().top < fold) return;
    const n = siblingIndex.get(el.parentElement) || 0;
    siblingIndex.set(el.parentElement, n + 1);
    el.style.setProperty('--d', Math.min(n, 3) * 80 + 'ms');
    el.classList.add('reveal');
    io.observe(el);
  });
})();

/* Lightbox for case-study photos: the photo grows out of its place (same-document view transition)
   over a blurred page. Esc, the close button or a click outside closes it; arrows step through. */
(() => {
  const photos = [...document.querySelectorAll('.case-hero:not(.case-hero--logo) img, .gallery img')];
  if (!photos.length) return;

  const icon = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const dlg = document.createElement('dialog');
  dlg.className = 'lightbox';
  dlg.setAttribute('aria-label', 'Photo viewer');
  dlg.innerHTML = '<figure><img alt=""><figcaption></figcaption></figure>' +
    `<button type="button" class="lb-btn lb-close" aria-label="Close">${icon('M6 6l12 12M18 6 6 18')}</button>` +
    `<button type="button" class="lb-btn lb-prev" aria-label="Previous photo">${icon('M15 5l-7 7 7 7')}</button>` +
    `<button type="button" class="lb-btn lb-next" aria-label="Next photo">${icon('M9 5l7 7-7 7')}</button>`;
  document.body.appendChild(dlg);
  const big = dlg.querySelector('img'), cap = dlg.querySelector('figcaption');
  const prev = dlg.querySelector('.lb-prev'), next = dlg.querySelector('.lb-next');
  prev.hidden = next.hidden = photos.length < 2;
  let cur = -1;
  const NAME = 'lb-photo';
  const animate = (fn) => (document.startViewTransition && !reduceMotion) ? document.startViewTransition(fn).finished : (fn(), Promise.resolve());

  const show = (i) => {
    const src = photos[i];
    big.src = src.currentSrc || src.src;
    big.alt = src.alt;
    cap.textContent = src.closest('figure')?.querySelector('figcaption')?.textContent || src.alt || '';
    cur = i;
  };

  const root = document.documentElement;
  const open = (i) => {
    root.classList.add('lb-active');           // nav + page hero sit out of the transition
    photos[i].style.viewTransitionName = NAME;
    animate(() => {
      photos[i].style.viewTransitionName = '';
      show(i);
      big.style.viewTransitionName = NAME;
      document.documentElement.classList.add('lb-open');
      dlg.showModal();
    });
  };

  const close = () => {
    if (!dlg.open) return;
    const back = photos[cur];
    animate(() => {
      big.style.viewTransitionName = '';
      dlg.close();
      document.documentElement.classList.remove('lb-open');
      back.style.viewTransitionName = NAME;
    }).then(() => { back.style.viewTransitionName = ''; root.classList.remove('lb-active'); back.focus({ preventScroll: true }); });
  };

  const step = (d) => animate(() => show((cur + d + photos.length) % photos.length));

  photos.forEach((img, i) => {
    img.classList.add('zoomable');
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', 'Enlarge photo' + (img.alt ? ': ' + img.alt : ''));
    img.addEventListener('click', () => open(i));
    img.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } });
  });
  dlg.querySelector('.lb-close').addEventListener('click', close);
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  big.addEventListener('click', close);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });   // click on the blurred page
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });    // Esc
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' && photos.length > 1) step(-1);
    if (e.key === 'ArrowRight' && photos.length > 1) step(1);
  });
})();
