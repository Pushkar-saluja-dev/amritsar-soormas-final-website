/* Hero slider + mobile nav */
(function () {
  var track = document.getElementById('slides');
  var slides = track ? track.children : [];
  var dotsBox = document.getElementById('dots');
  var index = 0;
  var timer;
  var AUTOPLAY_MS = 6000;

  function go(i) {
    index = (i + slides.length) % slides.length;
    track.style.transform = 'translateX(' + (-index * 100) + '%)';
    for (var d = 0; d < dotsBox.children.length; d++) {
      dotsBox.children[d].setAttribute('aria-selected', d === index);
    }
  }

  function restart() {
    clearInterval(timer);
    timer = setInterval(function () { go(index + 1); }, AUTOPLAY_MS);
  }

  if (track && slides.length) {
    for (var i = 0; i < slides.length; i++) {
      (function (n) {
        var b = document.createElement('button');
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-label', 'Slide ' + (n + 1));
        b.onclick = function () { go(n); restart(); };
        dotsBox.appendChild(b);
      })(i);
    }
    document.getElementById('prevBtn').onclick = function () { go(index - 1); restart(); };
    document.getElementById('nextBtn').onclick = function () { go(index + 1); restart(); };

    // swipe
    var x0 = null;
    track.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 45) { go(index + (dx < 0 ? 1 : -1)); restart(); }
      x0 = null;
    });

    // pause while off-screen or tab hidden
    document.addEventListener('visibilitychange', function () {
      document.hidden ? clearInterval(timer) : restart();
    });

    go(0);
    restart();
  }

  // mobile nav
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('nav');
  if (toggle && nav) {
    toggle.onclick = function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    };
    // close on a jump link only — the social links open a new tab and the click may
    // land on the icon's <svg>, not the <a>
    nav.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (link) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }
})();
