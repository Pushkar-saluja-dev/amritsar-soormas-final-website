/* Mobile nav + section behaviour */
(function () {
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

  // teams board — the map cycles through the six districts on its own, and a chip click
  // jumps straight to that side and restarts the clock
  var picker = document.getElementById('teamPicker');
  var teamsMap = document.getElementById('teamsMap');
  if (picker && teamsMap) {
    var chips = Array.prototype.slice.call(picker.querySelectorAll('.team-chip'));
    var frames = Array.prototype.slice.call(teamsMap.querySelectorAll('.map-frame'));
    var HOLD = 4000;   // keep in step with the chip-hold animation in styles.css
    var current = 0;
    var timer = null;
    var inView = !('IntersectionObserver' in window);

    // the captain card rides the same pick as the map — name, side and portrait, with a
    // clean "to be announced" state for the sides whose captain is not confirmed yet
    var capCard = document.getElementById('capCard');
    var capPic = document.getElementById('capPic');
    var capName = document.getElementById('capName');
    var capTeam = document.getElementById('capTeam');

    function paintCaptain(chip) {
      if (!capCard) return;
      var name = chip.getAttribute('data-captain') || '';
      var pic = chip.getAttribute('data-captain-pic') || '';
      var team = chip.querySelector('span').textContent;
      capName.textContent = name || 'To be announced';
      capTeam.textContent = team;
      capPic.src = pic || chip.querySelector('img').getAttribute('src');
      capPic.alt = pic ? name + ', captain of ' + team : '';
      // the card parks against the callout the lit frame draws, so it moves with the pick
      capCard.setAttribute('data-team', chip.getAttribute('data-team'));
      capCard.classList.toggle('is-tba', !name);    // no captain named yet
      capCard.classList.toggle('is-nopic', !pic);   // named, but no portrait to hand
      // re-adding the class replays the slide-in for every switch
      capCard.classList.remove('is-in');
      void capCard.offsetWidth;
      capCard.classList.add('is-in');
    }

    function show(i) {
      current = (i + chips.length) % chips.length;
      chips.forEach(function (c, n) {
        var on = n === current;
        // re-adding the class restarts the chip's countdown hairline, which matters when
        // the same chip is picked twice in a row
        if (on && c.classList.contains('is-active')) {
          c.classList.remove('is-active');
          void c.offsetWidth;
        }
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-pressed', on);
      });
      frames.forEach(function (f, n) {
        f.classList.toggle('is-on', n === current);
      });
      paintCaptain(chips[current]);
    }

    function play() {
      stop();
      if (!inView || document.hidden) return;
      picker.classList.remove('is-paused');
      timer = setInterval(function () { show(current + 1); }, HOLD);
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      picker.classList.add('is-paused');   // freezes the countdown hairline too
    }

    picker.addEventListener('click', function (e) {
      var chip = e.target.closest('.team-chip');
      if (!chip) return;
      show(chips.indexOf(chip));
      play();            // the click resets the hold so the pick is not cut short
    });

    // only run the loop while the board is on screen
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        inView ? play() : stop();
      }, { threshold: .25 }).observe(teamsMap);
    } else {
      play();
    }
    document.addEventListener('visibilitychange', function () {
      document.hidden ? stop() : play();
    });
  }
})();
