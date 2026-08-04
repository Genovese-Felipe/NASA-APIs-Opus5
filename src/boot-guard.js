/*
 * Last-resort boot guard.
 *
 * Deliberately NOT a module, and deliberately loaded before `main.js`.
 *
 * `main.js` already reports anything that goes wrong once it is running, and it
 * does that well. What it cannot report is a failure that stops it running at
 * all: a module that 404s, a syntax error, a browser too old to parse the
 * source, a page opened straight off the disk. In every one of those cases the
 * module never evaluates, no handler is ever installed, and the visitor is left
 * looking at "Assembling the solar system…" forever.
 *
 * That is the single worst failure mode this project has, because it is
 * indistinguishable from the application simply not working, and it produces no
 * console output a non-developer would ever see. So: a plain classic script,
 * parseable by anything, that installs a net before the module system is asked
 * to do anything at all.
 *
 * It is intentionally in English and intentionally dependency-free. By the time
 * this fires, the translation catalogues are exactly the thing that failed to
 * load, and reaching for them would be the second bug in a row.
 *
 * The single-file build strips this: everything is inlined there, so a module
 * cannot fail to arrive.
 */
(function () {
  'use strict';

  var shown = false;

  /**
   * Paint a failure into the boot overlay.
   * @param {string} heading
   * @param {string} advice
   * @param {string} [detail] Technical text, hidden behind a disclosure.
   */
  function fail(heading, advice, detail) {
    if (shown) return;
    shown = true;

    var status = document.getElementById('boot-status');
    var box = document.getElementById('boot-error');
    if (!box) return;

    if (status) status.textContent = '';
    box.hidden = false;
    box.textContent = '';

    var h = document.createElement('p');
    h.textContent = heading;
    h.style.fontWeight = '600';
    var p = document.createElement('p');
    p.textContent = advice;
    box.append(h, p);

    if (detail) {
      var details = document.createElement('details');
      var summary = document.createElement('summary');
      summary.textContent = 'Technical details';
      var pre = document.createElement('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.fontSize = '11px';
      pre.textContent = detail;
      details.append(summary, pre);
      box.append(details);
    }
  }

  // Opening the file straight from disk is the most common way to arrive at a
  // permanently blank page, and it is worth catching by inspection rather than
  // by waiting for the module loader to fail: browsers refuse ES modules over
  // file:// as a cross-origin request, and the error they log says nothing
  // about servers. The project ships a build for exactly this case.
  if (location.protocol === 'file:') {
    fail(
      'This page needs to be served over HTTP.',
      'Browsers refuse to load ES modules from the file system, so opening ' +
        'index.html directly can never work. Either run "npm run dev" and open ' +
        'http://localhost:8080, or use the single-file build — "npm run ' +
        'build:artifact" produces standalone.html, which has no imports and ' +
        'opens straight from disk.',
      'location.protocol === "file:"'
    );
    return;
  }

  // Capture phase, because a <script> or stylesheet that fails to load fires a
  // non-bubbling error event on the element itself. Without `true` here the
  // most important case — main.js never arrived — is silently missed.
  window.addEventListener(
    'error',
    function (event) {
      var target = event.target;
      if (target && target !== window && target.tagName === 'SCRIPT') {
        fail(
          'The application failed to load.',
          'A script the page depends on could not be fetched. If you are ' +
            'serving this yourself, check that the whole src/ directory was ' +
            'copied; if you are seeing this on the published site, it is a ' +
            'deployment problem rather than anything you did.',
          'Failed to load: ' + (target.src || '(inline script)')
        );
        return;
      }
      // A genuine uncaught exception. main.js handles the ones it can; this
      // covers the ones thrown while the module graph is still evaluating.
      if (event.error || event.message) {
        fail(
          'The application stopped during start-up.',
          'This is a bug. The technical details below identify where it ' +
            'happened, and are worth including in an issue report.',
          String((event.error && event.error.stack) || event.message)
        );
      }
    },
    true
  );

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    fail(
      'The application stopped during start-up.',
      'Something failed and the failure was never handled. If you are offline ' +
        'this is still not expected: the application is built to run from data ' +
        'committed alongside it.',
      String((reason && reason.stack) || reason)
    );
  });

  // A watchdog for the silent case: nothing threw, nothing 404'd, and yet the
  // application never finished starting. Generous, because a software
  // rasteriser genuinely does take the better part of a minute to compile these
  // shaders, and crying wolf on a slow machine would be worse than useless.
  var watchdog = setTimeout(function () {
    if (window.orrery && window.orrery.running) return;
    fail(
      'This is taking longer than it should.',
      'The application has not finished starting. On a machine without a GPU ' +
        'the shaders are compiled in software and this can legitimately take a ' +
        'minute or two, so it may still succeed. If it does not, reloading is ' +
        'safe, and the browser console will say more.',
      'No error was raised; the start-up sequence simply did not complete ' +
        'within 90 seconds.'
    );
  }, 90000);

  // main.js calls this the moment the first frame is up.
  window.__orreryBooted = function () {
    clearTimeout(watchdog);
  };
})();
