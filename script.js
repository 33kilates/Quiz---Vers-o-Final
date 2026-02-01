document.addEventListener('DOMContentLoaded', () => {

    // --- State Management ---
    const state = {
        answers: {},
        currentStepIndex: 0,
        screens: [],
        profile: 'Empresário em Construção'
    };

    // --- Init ---
    function init() {
        // Collect Screens
        const screenNodes = document.querySelectorAll('.quiz-screen');
        state.screens = Array.from(screenNodes);

        // Initial setup
        captureUTMs();

        // Setup Sticky CTA Listener
        setupStickyCTA();

        // Start View
        updateView();
    }

    // --- Core Navigation ---
    window.nextScreen = function () {
        if (state.currentStepIndex < state.screens.length - 1) {
            state.currentStepIndex++;
            updateView();
        }
    };

    window.selectOption = function (questionId, value, numericValue = null) {
        // 1. Save Answer
        state.answers[`q${questionId}`] = {
            value: value,
            numeric: numericValue
        };

        // 2. Track Interaction (Fail-safe)
        safeTrackEvent(`quiz_option_q${questionId}`, { value: value });

        // 3. Move Next
        setTimeout(nextScreen, 300);
    };

    // --- Calculating Screen Logic ---
    window.showCalculatingScreen = function () {
        const calcIdx = state.screens.findIndex(s => s.id === 'screen_calculating');
        if (calcIdx === -1) { determineProfile(); showResult(); return; }

        state.currentStepIndex = calcIdx;
        updateView();

        // Explicit Event
        safeTrackEvent('quiz_calc_view');

        // Animation
        const fill = document.getElementById('calc_fill');
        const text = document.getElementById('calc_text_step');

        if (fill) {
            // Random duration for realism
            const duration = 1800 + Math.random() * 800;

            fill.style.transition = `width ${duration}ms linear`;
            // Force reflow
            void fill.offsetWidth;
            fill.style.width = '100%';

            // Text Steps
            const steps = ["Estimando capital exposto...", "Calculando risco por ciclo...", "Montando seu diagnóstico..."];
            let stepIdx = 0;
            const stepTime = duration / steps.length;

            // Initial Text
            if (text) text.innerText = steps[0];

            let counter = 1;
            const stepInterval = setInterval(() => {
                if (counter < steps.length) {
                    if (text) text.innerText = steps[counter];
                    counter++;
                }
            }, stepTime);

            // Finish
            setTimeout(() => {
                clearInterval(stepInterval);
                determineProfile();
                showResult();
            }, duration);
        } else {
            // Fallback if DOM missing
            determineProfile();
            showResult();
        }
    };

    // --- Result Logic ---
    window.showResult = function () {
        const resIdx = state.screens.findIndex(s => s.id === 'screen_result');
        if (resIdx > -1) {
            state.currentStepIndex = resIdx;
            updateView();
            renderVisuals();
            safeTrackEvent('quiz_result_view', { profile: state.profile });
        }
    };

    window.goToCheckout = function () {
        safeTrackEvent('InitiateCheckout', { profile: state.profile });

        const checkoutBaseUrl = "https://pay.ticto.com.br/CHECKOUT_ID";
        const utms = getStoredUTMs();
        const url = new URL(checkoutBaseUrl);

        for (const [key, val] of Object.entries(utms)) {
            url.searchParams.append(key, val);
        }
        url.searchParams.append('perfil', state.profile);

        setTimeout(() => { window.location.href = url.toString(); }, 300);
    };

    // --- View Update Engine ---
    function updateView() {
        // 1. UI Reset
        state.screens.forEach(el => el.classList.remove('is-active'));
        const currentScreen = state.screens[state.currentStepIndex];
        currentScreen.classList.add('is-active');
        window.scrollTo(0, 0);

        const screenId = currentScreen.id;

        // 2. Run Calculations (PRIORITY: UI Updates First)
        if (screenId === 'screen_insight3_risk') runInsightRiskCalc();
        if (screenId === 'screen_b2_insight1') runInsightTimeCalc();

        // 3. Update Progress Bar
        updateProgress(currentScreen.dataset.step);

        // 4. Tracking (Last, so errors don't block UI)
        if (screenId !== 'screen_calculating') {
            safeTrackEvent('quiz_view', { screen_id: screenId });
        }
        if (screenId === 'screen_insight3_risk') safeTrackEvent('quiz_insight_risk_view');
        if (screenId === 'screen_b2_insight1') safeTrackEvent('quiz_insight_time_view');
    }

    function updateProgress(step) {
        const progressBar = document.getElementById('progress_bar');
        const progressText = document.getElementById('progress_text');

        if (!progressBar || !progressText) return;

        let percent = 0;
        let text = "DIAGNÓSTICO";

        if (!step) { text = ""; progressBar.style.width = "0%"; return; }

        if (step === 'intro' || step === '0' || step === '0.1') {
            percent = 5;
        } else if (step === 'insight') {
            // Rough estimate for insights based on current index
            percent = Math.min((state.currentStepIndex / state.screens.length) * 100, 95);
        } else if (step === 'result' || step === 'offer') {
            percent = 100;
            text = "CONCLUSÃO";
        } else {
            const num = parseFloat(step);
            if (!isNaN(num)) {
                // Assuming ~12 steps total
                percent = (num / 12) * 100;
                text = `ETAPA ${num} DE 12`;
            }
        }
        progressBar.style.width = `${percent}%`;
        progressText.innerText = text;
    }

    // --- Calculation Logic ---
    function runInsightRiskCalc() {
        console.log('Running Risk Calc...');

        // Defensive defaults: If user clicked non-numeric, use reasonable fallback
        const qtd = state.answers['q2'] ? state.answers['q2'].numeric : 10;
        const val = state.answers['q3'] ? state.answers['q3'].numeric : 800;

        // Ensure numbers
        const nQtd = Number(qtd) || 10;
        const nVal = Number(val) || 800;

        const total = nQtd * nVal;
        const risk = total * 0.15;

        // UI Updates
        setSafeText('live_risk_qtd', nQtd);
        setSafeText('live_risk_val', formatMoney(nVal));
        setSafeText('live_risk_total', formatMoney(total));

        // Animate
        const el = document.getElementById('live_risk_final');
        if (el) animateCountUp(el, 0, risk, 1500, true);

        safeTrackEvent('quiz_insight_risk_calc_done', { risk_val: risk });
    }

    function runInsightTimeCalc() {
        const time = state.answers['q8'] ? state.answers['q8'].numeric : 15;
        const nTime = Number(time) || 15;

        const totalMin = nTime * 10;
        const finalVal = (totalMin / 60).toFixed(1);

        setSafeText('live_time_bag', `~${nTime} min`);

        const el = document.getElementById('live_time_calc');
        if (el) animateCountUp(el, 0, parseFloat(finalVal), 1500, false, ' horas');

        safeTrackEvent('quiz_insight_time_calc_done');
    }

    function determineProfile() {
        const qtd = state.answers['q2'] ? state.answers['q2'].numeric : 0;
        const nQtd = Number(qtd) || 0;

        let profile = "Empresário em Construção";
        let text = "";
        let goodNews = "";

        if (nQtd > 70) {
            profile = "Empresário em Escala";
            text = "Seu diagnóstico é direto: <strong>Você já opera em volume.</strong> Mas paga um preço alto por isso. Revendedoras entram e saem, o controle depende de equipe e o risco se dilui, mas não desaparece.";
            goodNews = "Você não precisa de mais gente. Precisa decidir melhor quem entra, quanto recebe e onde se encaixa.";
        } else if (nQtd > 30) {
            profile = "Empresário em Expansão";
            text = "Seu diagnóstico mostra um alerta importante: <strong>Você já vende. Você já cresceu. Mas o controle não acompanhou.</strong> Hoje, o estoque sai e o risco aumenta.";
            goodNews = "Você não precisa desacelerar. Precisa organizar os perfis dentro da base.";
        } else {
            profile = "Empresário em Construção";
            text = "O seu diagnóstico é claro: <strong>Você ainda está montando sua base.</strong> E hoje, cada nova revendedora consome seu tempo e aumenta seu medo de errar.";
            goodNews = "Você está no melhor momento possível para acertar isso. Quem organiza a base cedo sofre menos.";
        }

        state.profile = profile;
        setSafeText('result_title', profile);

        const textEl = document.getElementById('result_text');
        if (textEl) textEl.innerHTML = text;

        setSafeText('result_good_news', goodNews);
    }

    function renderVisuals() {
        const qtd = state.answers['q2'] ? state.answers['q2'].numeric : 10;
        const val = state.answers['q3'] ? state.answers['q3'].numeric : 800;

        const nQtd = Number(qtd) || 10;
        const nVal = Number(val) || 800;

        // Donut
        let controlPct = 90;
        if (nQtd > 10) controlPct -= (nQtd - 10) * 0.2;
        controlPct = Math.max(15, controlPct);
        const outControlPct = 100 - controlPct;

        setSafeText('visual_donut_pct', `${Math.round(outControlPct)}%`);

        const donut = document.getElementById('visual_donut');
        if (donut) {
            const deg = (outControlPct / 100) * 360;
            donut.style.background = `conic-gradient(var(--danger) 0deg ${deg}deg, var(--success) ${deg}deg 360deg)`;
        }

        // Bar
        const totalRisk = (nQtd * nVal) * 0.15;

        setSafeText('visual_bar_risk_val', formatMoney(totalRisk));

        const barFill = document.getElementById('visual_bar_risk_fill');
        if (barFill) barFill.style.width = '80%';

        // Scorecard
        const sRisk = document.getElementById('score_risk');
        const sControl = document.getElementById('score_control');
        const sScale = document.getElementById('score_scale');

        if (nQtd > 50) {
            updateBadge(sRisk, 'ALTO', 'bad');
            updateBadge(sControl, 'CRÍTICO', 'bad');
            updateBadge(sScale, 'TRAVADO', 'bad');
        } else if (nQtd > 20) {
            updateBadge(sRisk, 'MÉDIO', 'mid');
            updateBadge(sControl, 'ATENÇÃO', 'mid');
            updateBadge(sScale, 'AJUSTÁVEL', 'mid');
        } else {
            updateBadge(sRisk, 'BAIXO', 'good');
            updateBadge(sControl, 'BOM', 'good');
            updateBadge(sScale, 'PRONTO', 'good');
        }
    }

    // --- Helpers ---
    function setupStickyCTA() {
        let isScrolling = false;
        window.addEventListener('scroll', () => {
            if (!isScrolling) {
                window.requestAnimationFrame(() => {
                    const offerScreen = document.getElementById('screen_offer');
                    const cta = document.getElementById('sticky_cta');
                    if (offerScreen && offerScreen.classList.contains('is-active') && cta) {
                        const scrollY = window.scrollY;
                        const docH = document.body.scrollHeight;
                        if (scrollY > docH * 0.25) cta.classList.add('visible');
                        else cta.classList.remove('visible');
                    }
                    isScrolling = false;
                });
                isScrolling = true;
            }
        }, { passive: true });
    }

    function animateCountUp(el, start, end, duration, isCurrency, suffix = '') {
        if (!el) return;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const currentVal = progress * (end - start) + start;

            if (isCurrency) {
                el.innerText = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentVal);
            } else {
                el.innerText = currentVal.toFixed(1).replace('.', ',') + suffix;
            }

            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                // Ensure Final Value is exact
                if (isCurrency) {
                    el.innerText = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(end);
                } else {
                    el.innerText = end.toFixed(1).replace('.', ',') + suffix;
                }
            }
        };
        window.requestAnimationFrame(step);
    }

    function updateBadge(el, text, type) {
        if (!el) return;
        el.innerText = text;
        el.className = `badge-status badge-${type}`;
    }

    function setSafeText(id, text) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    }

    function formatMoney(val) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    }

    function safeTrackEvent(name, params = {}) {
        try {
            if (typeof trk === 'function') trk(name, params);
            if (window.fbq) window.fbq('trackCustom', name, params);
            console.log(`[Track] ${name}`, params);
        } catch (e) {
            console.warn(`[Track Fail] ${name}`, e);
        }
    }

    function captureUTMs() {
        const params = new URLSearchParams(window.location.search);
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'].forEach(key => {
            if (params.has(key)) localStorage.setItem(key, params.get(key));
        });
    }

    function getStoredUTMs() {
        const data = {};
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'].forEach(key => {
            const val = localStorage.getItem(key);
            if (val) data[key] = val;
        });
        return data;
    }

    // Start
    init();
});
