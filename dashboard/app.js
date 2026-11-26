// Launch Clock dashboard: board, detail drawer, filters, sort, live-token view, model sandbox.
// No network: every number comes from window.RADAR, written by main.ts from the sealed snapshot.
// The sandbox re-ranks client-side from the same log-log fit the server used.
(function () {
  var D = window.RADAR;
  var rows = D.rows.slice();
  var watch = {};
  D.rows.forEach(function (r) { watch[r.slug] = true; });
  var $ = function (id) { return document.getElementById(id); };
  var fmt$ = function (n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  };
  var fmtPct = function (n) { return n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var ageOf = function (r) { return r.age_days === null ? '—' : r.age_days + 'd'; };

  // Header meta + model strip.
  $('meta').innerHTML = 'Snapshot <b>' + esc(D.as_of) + '</b> · ' + D.board_size + ' pre-token rows<br>' +
    'Watchlist <b>' + D.watchlist_size + '</b> · Live tokens <b>' + D.live_size + '</b> · ' + esc(D.model_version);
  var fit = D.fit;
  $('model').innerHTML = '<b>Model — log-log comparables, fitted held-out:</b> ' +
    '<code>ln(mcap) = ' + fit.intercept.toFixed(3) + ' + ' + fit.slope.toFixed(3) + ' × ln(TVL)</code> ' +
    'on ' + D.fit_size + ' live-token protocols, each category\'s median log-residual shrunk toward zero (prior 6), ' +
    '× growth tilt (weight ' + D.model.growth_weight + ') × maturity tilt (0.85–1.00). ' +
    'Every row shows a P25–P75 range from the fit\'s own residual quartiles — no false precision. ' +
    '<span class="val">Board rank is by implied value (the gate). Sort by farmer ROI or readiness to decide what to farm.</span>';
  var v = D.validation;
  $('valid').innerHTML = 'Held-out validation (median error predicting market cap): ' + v.map(function (t) {
    return esc(t.test) + ' — model ' + t.model_median_abs_pct_error + '% / log ' + t.model_median_abs_log_error +
      ' vs flat-0.25× baseline ' + t.baseline_median_abs_pct_error + '% / log ' + t.baseline_median_abs_log_error;
  }).join(' · ') + '. Raw category medians and the global median multiple were tested and dropped: both were worse than flat.';

  // Filter selects.
  var cats = {}, chains = {};
  rows.forEach(function (r) {
    if (r.category) cats[r.category] = 1;
    r.chains.forEach(function (c) { chains[c] = 1; });
  });
  Object.keys(cats).sort().forEach(function (c) { $('cat').appendChild(new Option(c, c)); });
  Object.keys(chains).sort().forEach(function (c) { $('chain').appendChild(new Option(c, c)); });

  // Sandbox: recompute implied values from the same fit, with the slider weights.
  function sandboxImplied(r) {
    var gw = parseFloat($('gw').value), mr = parseFloat($('mr').value), sp = parseFloat($('sp').value);
    var e = fit.category_residuals[r.category || 'Uncategorised'];
    var resid = e ? (e.n / (e.n + sp)) * e.median : 0;
    var base = Math.exp(fit.intercept + fit.slope * Math.log(r.tvl_usd) + resid);
    var g = Math.min(120, Math.max(-60, r.change_7d === null ? 0 : r.change_7d));
    var gm = 1 + (g / 100) * gw;
    var age = r.age_days === null ? 365 : r.age_days;
    var mm = (1 - mr) + (Math.min(age, 1095) / 1095) * mr;
    var imp = Math.max(1, Math.round(base * gm * mm));
    return { implied: imp, roi: imp / (r.farm_capital_usd * (r.farm_hold_days / 7)) / 1000000 };
  }
  function currentRows() {
    var gw = parseFloat($('gw').value), mr = parseFloat($('mr').value), sp = parseFloat($('sp').value);
    var changed = gw !== D.model.growth_weight || mr !== D.model.maturity_range || sp !== D.model.shrink_prior;
    return rows.map(function (r) {
      var c = changed ? sandboxImplied(r) : { implied: r.implied_value_usd, roi: r.roi_per_dollar_week };
      return { r: r, implied: c.implied, roi: c.roi };
    });
  }

  var sortKey = 'implied';
  function sortRows(list) {
    var k = sortKey;
    var get = {
      implied: function (x) { return x.implied; },
      roi: function (x) { return x.roi; },
      readiness: function (x) { return x.r.readiness; },
      tvl: function (x) { return x.r.tvl_usd; },
      growth: function (x) { return x.r.change_7d === null ? -999 : x.r.change_7d; },
      age: function (x) { return x.r.age_days === null ? 0 : x.r.age_days; },
      rank: function (x) { return x.r.rank; },
      name: function (x) { return x.r.name; }
    }[k] || function (x) { return x.implied; };
    list.sort(function (a, b) {
      var d = get(b) - get(a);
      return d !== 0 && !isNaN(d) ? d : a.r.rank - b.r.rank;
    });
    return list;
  }

  function render() {
    var q = $('q').value.trim().toLowerCase();
    var cat = $('cat').value, chain = $('chain').value;
    var minTvl = parseFloat($('minTvl').value) || 0;
    var minG = $('minGrowth').value === '' ? null : parseFloat($('minGrowth').value);
    var list = currentRows().filter(function (x) {
      var r = x.r;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
      if (cat && r.category !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (r.tvl_usd < minTvl) return false;
      if (minG !== null && (r.change_7d === null || r.change_7d < minG)) return false;
      return true;
    });
    sortRows(list);
    var body = $('rows');
    body.innerHTML = list.map(function (x) {
      var r = x.r;
      var badge = r.readiness_label === 'Ripe' ? 'ripe' : r.readiness_label === 'Warming' ? 'warming' : 'early';
      return '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>' +
        '<td class="name">' + (watch[r.slug] ? '<span class="star">★</span> ' : '') + esc(r.name) +
        '<span class="slug">' + esc(r.slug) + ' · ' + ageOf(r) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains.slice(0, 2).join(', ') || '—') + '</td>' +
        '<td class="num">' + fmt$(r.tvl_usd) + '</td><td class="num">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmt$(x.implied) + '<span class="rng">×' + r.multiple.toFixed(3) + ' TVL</span></td>' +
        '<td class="num">' + fmt$(r.implied_low_usd) + ' – ' + fmt$(r.implied_high_usd) + '</td>' +
        '<td><span class="badge ' + badge + '">' + r.readiness_label + ' ' + r.readiness + '</span></td>' +
        '<td class="num">' + x.roi.toFixed(3) + '</td><td>›</td></tr>';
    }).join('');
    $('count').textContent = list.length + ' of ' + rows.length + ' pre-token protocols · ★ = watchlist · click a row for the model, the peers and the farm plan';
    body.querySelectorAll('tr').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
  }

  function renderLive() {
    $('liveRows').innerHTML = D.live.map(function (p, i) {
      return '<tr><td class="num">' + (i + 1) + '</td><td class="name">' + esc(p.name) +
        '<span class="slug">' + esc(p.slug) + '</span></td><td>' + esc(p.category || '—') + '</td>' +
        '<td>' + esc(p.chains.slice(0, 2).join(', ') || '—') + '</td><td class="num">' + fmt$(p.tvl_usd) + '</td>' +
        '<td class="num">' + fmt$(p.mcap_usd) + '</td><td class="num">' + (p.multiple === null ? '—' : '×' + p.multiple.toFixed(3)) + '</td>' +
        '<td class="num">' + fmtPct(p.change_7d) + '</td></tr>';
    }).join('');
  }

  function openDetail(slug) {
    var r = rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    var badge = r.readiness_label === 'Ripe' ? 'ripe' : r.readiness_label === 'Warming' ? 'warming' : 'early';
    var math = 'TVL            ' + fmt$(r.tvl_usd) + '\n' +
      'log-log base   exp(' + fit.intercept.toFixed(3) + ' + ' + fit.slope.toFixed(3) + ' × ln(TVL)) = ' + fmt$(Math.exp(fit.intercept + fit.slope * Math.log(r.tvl_usd))) + '\n' +
      'category resid ' + (r.category_residual >= 0 ? '+' : '') + r.category_residual.toFixed(3) + ' (' + (r.category || 'Uncategorised') + ', ' + r.category_peers + ' live peers)\n' +
      'growth tilt    ×' + r.growth_multiplier.toFixed(3) + '  (7d ' + fmtPct(r.change_7d) + ')\n' +
      'maturity tilt  ×' + r.maturity_multiplier.toFixed(3) + '  (age ' + ageOf(r) + ')\n' +
      'implied        ' + fmt$(r.implied_value_usd) + '   P25–P75 ' + fmt$(r.implied_low_usd) + ' – ' + fmt$(r.implied_high_usd) + '\n' +
      'farmer ROI     ' + r.roi_per_dollar_week.toFixed(3) + ' implied $M per $ per week  (' + fmt$(r.farm_capital_usd) + ' capital, ' + r.farm_hold_days + ' days hold)';
    var chainLabel = r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) + ' more' : '');
    var peerRows = r.peers.length
      ? '<table><tbody>' + r.peers.map(function (p) {
          return '<tr><td>' + esc(p.name) + '</td><td class="num">×' + p.multiple.toFixed(3) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<p class="warn">No live-token protocol in ' + esc(r.category || 'this category') + ' yet — the category residual is shrunk to zero and this row is valued on the global fit alone.</p>';
    $('detail').innerHTML = '<button class="close" type="button">Close ×</button>' +
      '<h2>' + esc(r.name) + '</h2><div class="slug">' + esc(r.slug) + ' · rank #' + r.rank + ' · ' + esc(r.category || 'Uncategorised') + ' · ' + esc(chainLabel) + '</div>' +
      '<p><span class="badge ' + badge + '">' + r.readiness_label + ' ' + r.readiness + '</span> ' +
      (watch[r.slug] ? '<span class="star">★ Watchlist</span> ' : '') + 'Implied <b>' + fmt$(r.implied_value_usd) + '</b></p>' +
      '<h3>How the number is made</h3><div class="math">' + esc(math) + '</div>' +
      '<h3>Live peers in ' + esc(r.category || 'its category') + ' — their mcap / TVL</h3>' +
      peerRows +
      '<h3>Farm plan — $' + r.farm_capital_usd + ' capital, ' + r.farm_hold_days + ' days</h3><ol>' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="warn">This protocol records no token. Never pay to claim one — claim only from the link its own page publishes.</p>';
    $('detail').classList.remove('hidden');
    $('detail').querySelector('.close').addEventListener('click', function () { $('detail').classList.add('hidden'); });
  }

  function setView() {
    var live = $('status').value === 'live';
    $('board').classList.toggle('hidden', live);
    $('live').classList.toggle('hidden', !live);
    if (live) renderLive(); else render();
  }

  ['q', 'cat', 'chain', 'minTvl', 'minGrowth'].forEach(function (id) {
    $(id).addEventListener('input', render);
    $(id).addEventListener('change', render);
  });
  $('status').addEventListener('change', setView);
  $('sort').addEventListener('change', function () { sortKey = $('sort').value; render(); });
  $('reset').addEventListener('click', function () {
    $('q').value = ''; $('cat').value = ''; $('chain').value = ''; $('minTvl').value = 0; $('minGrowth').value = '';
    $('sort').value = 'implied'; sortKey = 'implied';
    $('gw').value = D.model.growth_weight; $('mr').value = D.model.maturity_range; $('sp').value = D.model.shrink_prior;
    syncSliders(); render();
  });
  function syncSliders() {
    $('gwVal').textContent = parseFloat($('gw').value).toFixed(2);
    $('mrVal').textContent = parseFloat($('mr').value).toFixed(2);
    $('spVal').textContent = $('sp').value;
  }
  ['gw', 'mr', 'sp'].forEach(function (id) {
    $(id).addEventListener('input', function () { syncSliders(); render(); });
  });
  document.querySelectorAll('#board thead th[data-k]').forEach(function (th) {
    th.addEventListener('click', function () {
      sortKey = th.getAttribute('data-k');
      $('sort').value = sortKey in { implied: 1, roi: 1, readiness: 1, tvl: 1, growth: 1, age: 1 } ? sortKey : 'implied';
      render();
    });
  });
  syncSliders();
  render();

  // Deep links for the three screenshots: #detail=<slug>, #filter=<category>&sort=<key>.
  var hash = location.hash.slice(1);
  if (hash) {
    var parts = {};
    hash.split('&').forEach(function (kv) { var p = kv.split('='); parts[p[0]] = decodeURIComponent(p[1] || ''); });
    if (parts.filter) { $('cat').value = parts.filter; }
    if (parts.sort) { sortKey = parts.sort; $('sort').value = parts.sort; }
    if (parts.filter || parts.sort) render();
    if (parts.detail) openDetail(parts.detail);
  }
})();
