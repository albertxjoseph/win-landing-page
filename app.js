/* ══════════════════════════════════════════════
   WINLIST — interest site behaviour
   ══════════════════════════════════════════════ */
(function () {
  'use strict';

  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ── year ───────────────────────────────── */
  var yr = $('#year');
  if (yr) yr.textContent = String(new Date().getFullYear());

  /* ── sticky header hairline ─────────────── */
  var header = $('#siteHeader');
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      header.classList.toggle('stuck', window.scrollY > 8);
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── scroll reveal ──────────────────────── */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    // Anything already on screen is shown synchronously — waiting on the first
    // observer callback can leave the hero blank for a frame or more.
    reveals.forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('in');
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) {
      if (!el.classList.contains('in')) io.observe(el);
    });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ══════════════  FORM  ══════════════ */
  var form        = $('#joinForm');
  if (!form) return;

  var TOTAL       = 4;
  var STEP_NAMES  = ['Your role', 'Contact', 'Your work', 'What you want'];
  var current     = 1;

  var steps       = $$('.step', form);
  var backBtn     = $('#backBtn');
  var nextBtn     = $('#nextBtn');
  var submitBtn   = $('#submitBtn');
  var progressLbl = $('#progressLabel');
  var progressPct = $('#progressPct');
  var progressBar = $('#progressBar');
  var progressFil = $('#progressFill');
  var formErr     = $('#formErr');
  var doneBox     = $('#done');
  var doneMsg     = $('#doneMsg');
  var DRAFT_KEY   = 'winlist.draft.v1';
  var startedAt   = Date.now();

  /* ── error helpers ──────────────────────── */
  function setErr(node, msg) {
    if (!node) return;
    node.textContent = msg || '';
    node.classList.toggle('on', !!msg);
  }
  function fieldOf(input) { return input.closest('.field'); }
  function fieldErr(input) {
    var f = fieldOf(input);
    return f ? f.querySelector('.err') : null;
  }
  function markField(input, msg) {
    var f = fieldOf(input);
    if (f) f.classList.toggle('invalid', !!msg);
    setErr(fieldErr(input), msg);
  }

  /* ── validators ─────────────────────────── */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

  function digits(s) { return (s || '').replace(/\D/g, ''); }

  function validateField(input) {
    var v = (input.value || '').trim();
    var id = input.id;

    if (id === 'fullName') {
      if (!v) return 'Enter your full name so we know who to invite.';
      if (v.length < 2) return 'That looks too short — please enter your full name.';
      return '';
    }
    if (id === 'email') {
      if (!v) return 'We need an email to send your invite.';
      if (!EMAIL_RE.test(v)) return 'That email looks incomplete. Check for a typo — e.g. name@company.com';
      return '';
    }
    if (id === 'phone') {
      if (!v) return 'We text invites first, so we need a number.';
      var d = digits(v);
      if (d.length < 7 || d.length > 15) return 'Enter a full phone number, including area code.';
      return '';
    }
    if (id === 'city') {
      if (!v) return 'Tell us your city — we open one city at a time.';
      return '';
    }
    if (id === 'field') {
      if (!v) return 'Pick the field that fits you best.';
      return '';
    }
    if (id === 'focus') {
      if (!v) return 'A sentence or two is all we need here.';
      if (v.length < 12) return 'Add a little more — one full sentence helps us match you.';
      return '';
    }
    if (id === 'link') {
      if (!v) return '';
      if (!/^https?:\/\/.+\..+/i.test(v)) return 'Include the full address, starting with https://';
      return '';
    }
    return '';
  }

  /* validate on blur, clear on input once corrected */
  $$('input, textarea, select', form).forEach(function (input) {
    if (input.type === 'checkbox' || input.type === 'radio' || input.id === 'company') return;
    input.addEventListener('blur', function () { markField(input, validateField(input)); });
    input.addEventListener('input', function () {
      var f = fieldOf(input);
      if (f && f.classList.contains('invalid') && !validateField(input)) markField(input, '');
      saveDraft();
    });
    input.addEventListener('change', saveDraft);
  });

  /* ── character counter ──────────────────── */
  var focusEl = $('#focus');
  var focusCount = $('#focusCount');
  if (focusEl && focusCount) {
    var updateCount = function () { focusCount.textContent = String(focusEl.value.length); };
    focusEl.addEventListener('input', updateCount);
    updateCount();
  }

  /* ── role changes the step-3 question ───── */
  function roleValue() {
    var r = form.querySelector('input[name="role"]:checked');
    return r ? r.value : '';
  }
  var focusLabel = $('#focusLabel');
  function syncRoleCopy() {
    if (!focusLabel) return;
    var req = ' <span class="req" aria-hidden="true">*</span>';
    focusLabel.innerHTML = (roleValue() === 'mentor'
      ? 'What could you help someone with?'
      : 'What are you working on right now?') + req;
    if (focusEl) {
      focusEl.placeholder = roleValue() === 'mentor'
        ? 'The problems people already come to you with.'
        : 'One or two sentences is plenty.';
    }
  }
  $$('input[name="role"]', form).forEach(function (r) {
    r.addEventListener('change', function () {
      setErr($('#roleErr'), '');
      syncRoleCopy();
      saveDraft();
    });
  });

  $$('input[name="goals"]', form).forEach(function (c) {
    c.addEventListener('change', function () { setErr($('#goalsErr'), ''); saveDraft(); });
  });
  var consentEl = $('#consent');
  if (consentEl) consentEl.addEventListener('change', function () {
    setErr($('#consentErr'), ''); saveDraft();
  });

  /* ── step navigation ────────────────────── */
  function showStep(n, focusFirst) {
    current = n;
    steps.forEach(function (s) { s.hidden = Number(s.dataset.step) !== n; });

    var pct = Math.round((n / TOTAL) * 100);
    progressLbl.textContent = 'Step ' + n + ' of ' + TOTAL + ' · ' + STEP_NAMES[n - 1];
    progressPct.textContent = pct + '%';
    progressFil.style.width = pct + '%';
    progressBar.setAttribute('aria-valuenow', String(n));

    backBtn.hidden   = n === 1;
    nextBtn.hidden   = n === TOTAL;
    submitBtn.hidden = n !== TOTAL;
    setErr(formErr, '');

    if (focusFirst) {
      var step = steps[n - 1];
      var target = step.querySelector('input:not([type=hidden]), textarea, select');
      if (target) target.focus({ preventScroll: true });
    }
  }

  function validateStep(n) {
    var problems = [];

    if (n === 1) {
      if (!roleValue()) {
        setErr($('#roleErr'), 'Pick one so we know which application to send you.');
        problems.push($$('input[name="role"]', form)[0]);
      }
    }
    if (n === 2) {
      ['fullName', 'email', 'phone', 'city'].forEach(function (id) {
        var el = $('#' + id);
        var msg = validateField(el);
        markField(el, msg);
        if (msg) problems.push(el);
      });
    }
    if (n === 3) {
      ['field', 'focus', 'link'].forEach(function (id) {
        var el = $('#' + id);
        var msg = validateField(el);
        markField(el, msg);
        if (msg) problems.push(el);
      });
    }
    if (n === 4) {
      var goals = $$('input[name="goals"]:checked', form);
      if (!goals.length) {
        setErr($('#goalsErr'), 'Pick at least one — this is how we match you.');
        problems.push($$('input[name="goals"]', form)[0]);
      }
      if (!consentEl.checked) {
        setErr($('#consentErr'), 'We need your okay before we can contact you.');
        problems.push(consentEl);
      }
    }

    if (problems.length) {
      problems[0].focus({ preventScroll: true });
      problems[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
      return false;
    }
    return true;
  }

  nextBtn.addEventListener('click', function () {
    if (!validateStep(current)) return;
    showStep(Math.min(current + 1, TOTAL), true);
  });
  backBtn.addEventListener('click', function () {
    showStep(Math.max(current - 1, 1), true);
  });

  /* Enter advances instead of submitting early */
  form.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (e.target.tagName === 'TEXTAREA') return;
    if (current < TOTAL) { e.preventDefault(); nextBtn.click(); }
  });

  /* ── role cards jump into the form ──────── */
  $$('.role-card').forEach(function (card) {
    card.addEventListener('click', function () {
      var wanted = card.dataset.role;
      var radio = form.querySelector('input[name="role"][value="' + wanted + '"]');
      if (radio) { radio.checked = true; syncRoleCopy(); saveDraft(); }
      setErr($('#roleErr'), '');
      document.getElementById('join').scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(function () { showStep(2, true); }, 520);
    });
  });

  /* ── draft autosave ─────────────────────── */
  function saveDraft() {
    try {
      var data = collect();
      delete data.company;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } catch (e) { /* storage unavailable — not fatal */ }
  }
  function loadDraft() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      Object.keys(d).forEach(function (k) {
        if (k === 'goals' || k === 'role' || k === 'consent') return;
        var el = form.elements[k];
        if (el && typeof el.value === 'string') el.value = d[k] || '';
      });
      if (d.role) {
        var r = form.querySelector('input[name="role"][value="' + d.role + '"]');
        if (r) r.checked = true;
      }
      if (Array.isArray(d.goals)) {
        $$('input[name="goals"]', form).forEach(function (c) {
          c.checked = d.goals.indexOf(c.value) !== -1;
        });
      }
      if (consentEl) consentEl.checked = !!d.consent;
      syncRoleCopy();
      if (focusEl && focusCount) focusCount.textContent = String(focusEl.value.length);
    } catch (e) { /* corrupt draft — ignore */ }
  }
  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
  }

  /* ── collect + submit ───────────────────── */
  function collect() {
    return {
      role:     roleValue(),
      fullName: $('#fullName').value.trim(),
      email:    $('#email').value.trim(),
      phone:    $('#phone').value.trim(),
      city:     $('#city').value.trim(),
      field:    $('#field').value,
      focus:    $('#focus').value.trim(),
      link:     $('#link').value.trim(),
      goals:    $$('input[name="goals"]:checked', form).map(function (c) { return c.value; }),
      referral: $('#referral').value,
      notes:    $('#notes').value.trim(),
      consent:  consentEl.checked,
      company:  $('#company').value,
      elapsed:  Math.round((Date.now() - startedAt) / 1000)
    };
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validateStep(TOTAL)) return;

    var payload = collect();
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    backBtn.disabled = true;
    setErr(formErr, '');

    var ctrl = new AbortController();
    var timer = window.setTimeout(function () { ctrl.abort(); }, 15000);

    fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { ok: res.ok, status: res.status, body: body };
        });
      })
      .then(function (r) {
        if (r.ok) { succeed(payload, r.body); return; }

        if (r.status === 409) {
          setErr(formErr, "You're already on the list with that email — we've got you.");
        } else if (r.status === 429) {
          setErr(formErr, 'Too many attempts from this device. Give it a minute and try again.');
        } else if (r.status === 400 && r.body && r.body.error) {
          setErr(formErr, r.body.error);
        } else if (r.status === 503) {
          setErr(formErr, "The form isn't connected yet. Email us at support@thewinlist.app and we'll add you by hand.");
        } else {
          setErr(formErr, "That didn't go through. Try again — if it keeps failing, email support@thewinlist.app.");
        }
      })
      .catch(function (err) {
        setErr(formErr, err && err.name === 'AbortError'
          ? 'That took too long. Check your connection and try again.'
          : "We couldn't reach the server. Check your connection and try again.");
      })
      .then(function () {
        window.clearTimeout(timer);
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        backBtn.disabled = false;
      });
  });

  function succeed(payload, body) {
    clearDraft();
    form.hidden = true;
    $('.progress').hidden = true;
    doneBox.hidden = false;

    var first = (payload.fullName || '').split(' ')[0];
    var lead = first ? first + ', you' : 'You';
    doneMsg.textContent = (body && body.duplicate)
      ? lead + "'re already on the list — we've updated your answers. We'll text you when your city opens."
      : lead + "'re on the list. Invites go out city by city — we'll text you the moment " +
        (payload.city ? payload.city.split(',')[0] : 'your city') + ' opens.';

    // doneBox is role="status" aria-live="polite", so it announces itself —
    // no focus grab needed, which keeps a ring off a non-interactive heading.
    doneBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#againBtn').focus({ preventScroll: true });
  }

  $('#againBtn').addEventListener('click', function () {
    form.reset();
    clearDraft();
    $$('.field').forEach(function (f) { f.classList.remove('invalid'); });
    $$('.err').forEach(function (n) { setErr(n, ''); });
    if (focusCount) focusCount.textContent = '0';
    syncRoleCopy();
    doneBox.hidden = true;
    form.hidden = false;
    $('.progress').hidden = false;
    startedAt = Date.now();
    showStep(1, true);
  });

  /* ── boot ───────────────────────────────── */
  loadDraft();
  syncRoleCopy();
  showStep(1, false);
})();
