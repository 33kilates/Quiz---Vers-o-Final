document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    const state = {
        answers: {},
        currentStepIndex: 0,
        screens: [],
        profile: 'Empresário em Construção'
    };

    // --- Init ---
    function init() {
        const screenNodes = document.querySelectorAll('.quiz-screen');
        state.screens = Array.from(screenNodes);
        captureUTMs();
        updateView();

        // Sticky CTA Scroll Listener (Optimized)
        let isScrolling = false;
        window.addEventListener('scroll', () => {
            if (!isScrolling) {
                window.requestAnimationFrame(() => {
                    handleStickyCTA();
                    isScrolling = false;
                });
                isScrolling = true;
            }
        }, { passive: true });
    }

    // --- Navigation ---
    window.nextScreen = function () {
        if (state.currentStepIndex < state.screens.length - 1) {
            state.currentStepIndex++;
            updateView();
        }
    };

    window.selectOption = function (questionId, value, numericValue = null) {
        state.answers[`q${questionId}`] = {
            value: value,
            numeric: numericValue
        };
        trackEvent(`quiz_option_q${questionId}`, { value: value });
        setTimeout(nextScreen, 300);
    };

    window.showCalculatingScreen = function () {
        // Find calc screen index
        const calcIdx = state.screens.findIndex(s => s.id === 'screen_calculating');
        if (calcIdx === -1) { determineProfile(); showResult(); return; }

        state.currentStepIndex = calcIdx;
        updateView();

        trackEvent('quiz_calc_view');

        // Animation Logic
        const duration = 1800 + Math.random() * 600; // 1.8s - 2.4s
        const fill = document.getElementById('calc_fill');
        const text = document.getElementById('calc_text_step');

        fill.style.transition = `width ${duration}ms linear`;
        fill.style.width = '100%';

        const steps = ["Estimando capital exposto...", "Calculando risco por ciclo...", "Montando seu diagnóstico..."];
        let stepIdx = 0;

        const stepInterval = setInterval(() => {
            if (stepIdx < steps.length) {
                text.innerText = steps[stepIdx];
                stepIdx++;
            }
        }, duration / 3);

        setTimeout(() => {
            clearInterval(stepInterval);
            determineProfile();
            showResult(); // Move to result next
        }, duration);
    };

    window.showResult = function () {
        // Find result screen index
        const resIdx = state.screens.findIndex(s => s.id === 'screen_result');
        state.currentStepIndex = resIdx;
        updateView();

        // Explicit Result View Event
        trackEvent('quiz_result_view', { profile: state.profile });

        renderVisuals(); // Render visuals on result
    };

    window.goToCheckout = function () {
        trackEvent('InitiateCheckout', { profile: state.profile });
        const checkoutBaseUrl = "https://pay.ticto.com.br/CHECKOUT_ID"; // Placeholder
        const utms = getStoredUTMs();
        const url = new URL(checkoutBaseUrl);
        for (const [key, val] of Object.entries(utms)) url.searchParams.append(key, val);
        url.searchParams.append('perfil', state.profile);

        setTimeout(() => { window.location.href = url.toString(); }, 300);
    };

    // --- View Logic ---
    function updateView() {
        state.screens.forEach(el => el.classList.remove('is-active'));
        const currentScreen = state.screens[state.currentStepIndex];
        currentScreen.classList.add('is-active');
        window.scrollTo(0, 0);
        updateProgress(currentScreen.dataset.step);

        // Default View Tracking
        if (screenId !== 'screen_calculating') {
            trackEvent('quiz_view', { screen_id: screenId });
        }

        // Specific Insight Events & Calculations (Explicit as requested)
        if (screenId === 'screen_insight3_risk') {
            trackEvent('quiz_insight_risk_view');
            runInsightRiskCalc();
        }
        if (screenId === 'screen_b2_insight1') {
            trackEvent('quiz_insight_time_view');
            runInsightTimeCalc();
        }
    }

    function updateProgress(step) {
        const progressBar = document.getElementById('progress_bar');
        const progressText = document.getElementById('progress_text');

        let percent = 0;
        let text = "DIAGNÓSTICO";

        if (!step) { text = ""; progressBar.style.width = "0%"; return; } // Calc screen

        if (step === 'intro' || step === '0' || step === '0.1') {
            percent = 5;
        } else if (step === 'insight') {
            percent = (state.currentStepIndex / state.screens.length) * 100;
        } else if (step === 'result' || step === 'offer') {
            percent = 100;
            text = "CONCLUSÃO";
        } else {
            const num = parseFloat(step);
            if (!isNaN(num)) {
                percent = (num / 12) * 100;
                text = `ETAPA ${num} DE 12`;
            }
        }
        progressBar.style.width = `${percent}%`;
        progressText.innerText = text;
    }

    // --- Specific Insight Progresive Calcs ---
    function runInsightRiskCalc() {
        const qtd = state.answers['q2']?.numeric || 10;
        const val = state.answers['q3']?.numeric || 800;
        const total = qtd * val;
        const risk = total * 0.15;

        // Set static vars instantly
        setSafeText('live_risk_qtd', qtd);
        setSafeText('live_risk_val', formatMoney(val));
        setSafeText('live_risk_total', formatMoney(total));

        // Animate Result
        const el = document.getElementById('live_risk_final');
        if (el) animateCountUp(el, 0, risk, 1500, true);

        trackEvent('quiz_insight_risk_calc_done');
    }

    function runInsightTimeCalc() {
        const time = state.answers['q8']?.numeric || 15;
        // logic: time * 10 bags in a day = min
        const totalMin = time * 10;
        // display in hours?
        // text says "X horas"
        const finalVal = (totalMin / 60).toFixed(1);

        setSafeText('live_time_bag', `~${time} min`);

        const el = document.getElementById('live_time_calc');
        if (el) animateCountUp(el, 0, parseFloat(finalVal), 1500, false, ' horas');
    }

    function animateCountUp(el, start, end, duration, isCurrency, suffix = '') {
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
            }
        };
        window.requestAnimationFrame(step);
    }

    // --- Final Visuals Render ---
    function renderVisuals() {
        // Logic for Visuals
        const qtd = state.answers['q2']?.numeric || 10;
        const val = state.answers['q3']?.numeric || 800;
        const cycleDays = 30; // approx

        // Donut: Control vs Out of Control
        // Logic: More Qtd + More Cycle => More Out of Control
        // Base healthy: 90% control.
        // Penalty per Qtd > 10: -0.5%
        // Penalty per cycle > 15: -1%
        let controlPct = 90;
        if (qtd > 10) controlPct -= (qtd - 10) * 0.2;
        controlPct = Math.max(15, controlPct); // Min 15% control
        const outControlPct = 100 - controlPct;

        setSafeText('visual_donut_pct', `${Math.round(outControlPct)}%`);
        // Gradient logic
        const donut = document.getElementById('visual_donut');
        if (donut) {
            // danger from 0 to X deg, green from X to 360
            const deg = (outControlPct / 100) * 360;
            donut.style.background = `conic-gradient(var(--danger) 0deg ${deg}deg, var(--success) ${deg}deg 360deg)`;
        }

        // Bar: Risk vs Healthy
        const totalRisk = (qtd * val) * 0.15; // User risk
        const healthyRisk = (qtd * val) * 0.04; // "Standard healthy" ~4%

        setSafeText('visual_bar_risk_val', formatMoney(totalRisk));

        const barFill = document.getElementById('visual_bar_risk_fill');
        if (barFill) {
            // If totalRisk is 100% width, healthy is ratio
            // Let's cap visual width at 100% for the highest value?
            // Actually let's say the bar allows up to 150% of risk for visual drama?
            // Better: User risk is 80% width always to look big, healthy is relative small.
            barFill.style.width = '80%';
            // no, wait, visual needs comparison.
            // Let's make the container relative.
            // User Bar = 80%. Helper Bar = (Healthy/Risk)*80%
            // But they are separate bars.
            // So: User Bar = 80% width (Visual drama).
            // Healthy Bar below it.
        }

        // Scorecard
        const sRisk = document.getElementById('score_risk');
        const sControl = document.getElementById('score_control');
        const sScale = document.getElementById('score_scale');

        // Logic
        if (qtd > 50) {
            updateBadge(sRisk, 'ALTO', 'bad');
            updateBadge(sControl, 'CRÍTICO', 'bad');
            updateBadge(sScale, 'TRAVADO', 'bad');
        } else if (qtd > 20) {
            updateBadge(sRisk, 'MÉDIO', 'mid');
            updateBadge(sControl, 'ATENÇÃO', 'mid');
            updateBadge(sScale, 'AJUSTÁVEL', 'mid');
        } else {
            updateBadge(sRisk, 'BAIXO', 'good');
            updateBadge(sControl, 'BOM', 'good');
            updateBadge(sScale, 'PRONTO', 'good');
        }
    }

    function updateBadge(el, text, type) {
        if (!el) return;
        el.innerText = text;
        el.className = `badge-status badge-${type}`;
    }

    function determineProfile() {
        const qtd = state.answers['q2']?.numeric || 0;
        let profile = "Empresário em Construção";
        let text = "";
        let goodNews = "";

        if (qtd > 70) {
            profile = "Empresário em Escala";
            text = "Seu diagnóstico é direto: <strong>Você já opera em volume.</strong> Mas paga um preço alto por isso. Revendedoras entram e saem, o controle depende de equipe e o risco se dilui, mas não desaparece.";
            goodNews = "Você não precisa de mais gente. Precisa decidir melhor quem entra, quanto recebe e onde se encaixa.";
        } else if (qtd > 30) {
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

    // --- Sticky CTA ---
    function handleStickyCTA() {
        const offerScreen = document.getElementById('screen_offer');
        if (!offerScreen.classList.contains('is-active')) return;

        const cta = document.getElementById('sticky_cta');
        // Logic: Show after scrolling 25% of the offer screen
        const scrollY = window.scrollY;
        const winH = window.innerHeight;
        const docH = document.body.scrollHeight;

        // Simple threshold: if user scrolled past 25% of content
        if (scrollY > docH * 0.25) {
            cta.classList.add('visible');
        } else {
            cta.classList.remove('visible');
        }
    }

    // --- Helpers ---
    function setSafeText(id, text) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    }

    function formatMoney(val) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    }

    function trackEvent(name, params = {}) {
        if (typeof trk === 'function') trk(name, params);
        if (window.fbq) window.fbq('trackCustom', name, params);
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

    init();
});
