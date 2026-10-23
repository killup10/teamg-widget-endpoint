/* ES5: keep legacy music grids responsive while artwork is loading. */
(function(root) {
  var jobs = [], nextTimer = null;
  function legacy() {
    var ua = (root.navigator && root.navigator.userAgent) || '';
    return /NetCast/i.test(ua) && !/webOS|Web0S/i.test(ua);
  }
  function stop() {
    root.clearTimeout(nextTimer);
    nextTimer = null;
    for (var i = 0; i < jobs.length; i++) jobs[i]();
    jobs = [];
  }
  function thumbnail(url) {
    var value = String(url || '');
    // M3U parsing may already have wrapped the original URL in our proxy.
    if (value.indexOf('/api/ott/img?url=') !== -1) {
      try { value = decodeURIComponent(value.split('/api/ott/img?url=')[1]); } catch (e) { return url; }
    }
    if (/^https?:\/\/is\d+-ssl\.mzstatic\.com\//i.test(value)) {
      value = value.replace(/\/\d+x\d+bb\.[^?]+/i, '/200x200bb.jpg');
    } else if (/^https?:\/\/images\.unsplash\.com\//i.test(value)) {
      value = value.replace(/([?&])(?:w|q|fm|auto)=[^&]*/gi, '$1').replace(/[?&]+$/, '');
      value += (value.indexOf('?') < 0 ? '?' : '&') + 'w=200&q=65&fm=jpg';
    } else if (/^https?:\/\/[^/]*\.sndcdn\.com\//i.test(value)) {
      value = value.replace(/-(?:t500x500|original)\./i, '-large.');
    }
    return value;
  }
  function start(container, fit) {
    stop();
    var images = container.querySelectorAll('img[data-music-src]');
    var index = 0, active = 0, cancelled = false;
    function schedule() {
      root.clearTimeout(nextTimer);
      nextTimer = root.setTimeout(pump, 40);
    }
    function pump() {
      if (cancelled) return;
      while (active < 2 && index < images.length) load(images[index++]);
    }
    function load(img) {
      active++;
      var done = false, timer;
      function finish(ok) {
        if (done) return;
        done = true;
        root.clearTimeout(timer);
        img.onload = img.onerror = null;
        active--;
        if (!cancelled) {
          if (ok && fit) fit(img);
          else { img.removeAttribute('src'); img.style.display = 'none'; }
          schedule();
        }
      }
      jobs.push(function() {
        if (!done) { root.clearTimeout(timer); img.onload = img.onerror = null; img.removeAttribute('src'); done = true; }
      });
      img.onload = function() { finish(true); };
      img.onerror = function() { finish(false); };
      timer = root.setTimeout(function() { finish(false); }, 6000);
      img.src = img.getAttribute('data-music-src');
    }
    jobs.push(function() { cancelled = true; });
    // Yield once so the grid and remote focus appear before network/decode work.
    schedule();
  }
  root.TeamGCatalogImages = {legacy:legacy, thumbnail:thumbnail, start:start, stop:stop};
})(window);
