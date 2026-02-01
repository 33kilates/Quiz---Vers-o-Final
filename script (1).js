document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    const state = {
        answers: {},
        currentStepIndex: 0,
        screens: [],
        profile: 'Empresário em Construção',
        lastQuestionStep: 0
    };

    // --- Init ---
    function init() {
        const screenNodes = document.querySelectorAll('.quiz-screen');
        state.screens = Array.from(screenNodes);
        captureUTMs();
        updateView();
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

        // Logic Triggers
        if (questionId === 3) calculateRisk(); // Now Q3 is Value, Q2 is Qtd.
        if (questionId === 8) calculateTimeLoss(); // Block 2 Q3 is screen_step=8

        trackEvent(`quiz_option_q${questionId}`, { value: value });
        setTimeout(nextScreen, 300);
    };

    window.showResult = function () {
        determineProfile();
        nextScreen();
    };

    function goToScreenId(screenId) {
        const idx = state.screens.findIndex(s => s.id === screenId);
        if (idx < 0) return;
        state.currentStepIndex = idx;
        updateView();
    }

    function animateCalcProgress({ durationMs = 1600 } = {}) {
        const bar = document.getElementById('calc_progress_bar');
        const fill = document.getElementById('calc_progress_fill');
        const pct = document.getElementById('calc_percent');
        if (!bar || !fill || !pct) return Promise.resolve();

        fill.style.width = '0%';
        pct.textContent = '0%';

        const start = performance.now();
        return new Promise(resolve => {
            function tick(now) {
                const t = Math.min(1, (now - start) / durationMs);
                // Ease-out simples
                const eased = 1 - Math.pow(1 - t, 3);
                const p = Math.round(eased * 100);
                fill.style.width = `${p}%`;
                pct.textContent = `${p}%`;
                if (t < 1) requestAnimationFrame(tick);
                else resolve();
            }
            requestAnimationFrame(tick);
        });
    }

    // Fluxo final (botão no fim do quiz)
    window.startResultFlow = async function () {
        // Reforça personalização: recalcula tudo ANTES do diagnóstico
        determineProfile();
        calculateRisk(true);

        goToScreenId('screen_calculating');
        await animateCalcProgress({ durationMs: 1500 });
        goToScreenId('screen_result');
    };

    window.goToCheckout = function () {
        trackEvent('InitiateCheckout', { profile: state.profile });

        // Use generic placeholder or specific if known. 
        // User prompt didn't specify URL this time, so assuming standard behavior.
        const checkoutBaseUrl = "https://pay.ticto.com.br/CHECKOUT_ID";
        const utms = getStoredUTMs();
        const url = new URL(checkoutBaseUrl);

        for (const [key, val] of Object.entries(utms)) {
            url.searchParams.append(key, val);
        }
        url.searchParams.append('perfil', state.profile);

        setTimeout(() => {
            window.location.href = url.toString();
        }, 300);
    };

    // --- View Logic ---
    function updateView() {
        state.screens.forEach(el => el.classList.remove('is-active'));
        const currentScreen = state.screens[state.currentStepIndex];
        currentScreen.classList.add('is-active');
        window.scrollTo(0, 0);
        updateProgress(currentScreen.dataset.step);

        const screenId = currentScreen.id;
        if (screenId === 'screen_b1_insight' || screenId === 'screen_offer') {
            // "efeito carregando" nas telas que exibem números
            calculateRisk(true);
        }
        trackEvent('quiz_view', { screen_id: screenId });
    }

    function updateProgress(step) {
        const progressBar = document.getElementById('progress_bar');
        const progressText = document.getElementById('progress_text');

        let percent = 0;
        let text = "DIAGNÓSTICO";

        if (step === 'intro' || step === '0' || step === '0.1') {
            percent = 5;
        } else if (step === 'calc') {
            // Tela de "calculando" não muda a contagem, só mostra movimento
            percent = Math.max(85, (state.lastQuestionStep / totalQuestions) * 100);
            text = "CALCULANDO";
        } else if (step === 'insight') {
            // Insights seguem o progresso da ÚLTIMA pergunta respondida
            percent = (state.lastQuestionStep / totalQuestions) * 100;
            text = state.lastQuestionStep > 0 ? `ETAPA ${state.lastQuestionStep} DE ${totalQuestions}` : text;
        } else if (step === 'result' || step === 'offer') {
            percent = 100;
            text = "CONCLUSÃO";
        } else {
            // Numeric steps 1-12
            const num = parseFloat(step);
            if (!isNaN(num)) {
                state.lastQuestionStep = Math.max(state.lastQuestionStep, num);
                percent = (num / totalQuestions) * 100;
                text = `ETAPA ${num} DE ${totalQuestions}`;
            }
        }
        progressBar.style.width = `${percent}%`;
        progressText.innerText = text;
    }

    // --- Calculations ---
    function calculateRisk(animate = false) {
        // Q2 = Qtd, Q3 = Value
        const qtd = state.answers['q2']?.numeric || 10;
        const val = state.answers['q3']?.numeric || 800;

        const totalExposed = qtd * val;

        // Risco fica mais realista quando leva em conta o tempo do ciclo
        // (quanto mais tempo fora, maior a chance de atraso/acerto incompleto).
        const tempo = state.answers['q4']?.label || '';
        let riskRate = 0.15; // base
        if (/Até 15/.test(tempo)) riskRate = 0.08;
        else if (/16 a 30/.test(tempo)) riskRate = 0.12;
        else if (/31 a 45/.test(tempo)) riskRate = 0.15;
        else if (/Mais de 45/.test(tempo)) riskRate = 0.20;

        // ...e ajusta um pouco pelo nível de controle declarado
        const ctrl = (state.answers['q1']?.label || '') + ' ' + (state.answers['q5']?.label || '');
        if (/totalmente sob controle|Sim, rapidamente/i.test(ctrl)) riskRate = Math.max(0.06, riskRate - 0.02);
        if (/prefiro não pensar|Não com precisão|Não$/i.test(ctrl)) riskRate = Math.min(0.25, riskRate + 0.03);

        const risk = totalExposed * riskRate;

        setSafeText('risk_qtd', qtd);

        const elVal = document.getElementById('risk_val');
        const elTotal = document.getElementById('risk_total');
        const elRisk = document.getElementById('risk_final');

        if (animate) {
            // Mostra um "carregando" rápido, depois anima os números
            if (elVal) elVal.textContent = '...';
            if (elTotal) elTotal.textContent = '...';
            if (elRisk) elRisk.textContent = '...';

            setTimeout(() => {
                animateMoneyValue(elVal, val, { durationMs: 700 });
                animateMoneyValue(elTotal, totalExposed, { durationMs: 1000 });
                animateMoneyValue(elRisk, risk, { durationMs: 1100 });
            }, 250);
        } else {
            setSafeText('risk_val', formatMoney(val));
            setSafeText('risk_total', formatMoney(totalExposed));
            setSafeText('risk_final', formatMoney(risk));
        }

        // Reflete os mesmos números na tela de oferta (mini-LP)
        const offerCapital = document.getElementById('offer_capital_out');
        const offerRisk = document.getElementById('offer_risk_cycle');
        const offerRate = document.getElementById('offer_risk_rate');
        if (offerRate) offerRate.textContent = `${Math.round(riskRate * 100)}%`;
        if (animate) {
            if (offerCapital) offerCapital.textContent = '...';
            if (offerRisk) offerRisk.textContent = '...';
            setTimeout(() => {
                animateMoneyValue(offerCapital, totalExposed, { durationMs: 1000 });
                animateMoneyValue(offerRisk, risk, { durationMs: 1100 });
            }, 250);
        } else {
            if (offerCapital) offerCapital.textContent = formatMoney(totalExposed);
            if (offerRisk) offerRisk.textContent = formatMoney(risk);
        }

        const riskBar = document.getElementById('offer_bar_risk');
        const controlBar = document.getElementById('offer_bar_control');
        const riskPct = Math.min(95, Math.max(5, Math.round(riskRate * 100)));
        // Controle "percebido" pelo próprio empresário (Q1/Q5)
        let controlPct = 55;
        const q1 = state.answers['q1']?.label || '';
        const q5 = state.answers['q5']?.label || '';
        if (/totalmente sob controle/i.test(q1) || /Sim, rapidamente/i.test(q5)) controlPct = 80;
        if (/controlo mais ou menos/i.test(q1) || /dá trabalho/i.test(q5)) controlPct = 55;
        if (/não sei exatamente/i.test(q1) || /Não com precisão/i.test(q5)) controlPct = 35;
        if (/prefiro não pensar/i.test(q1) || /^Não$/i.test(q5)) controlPct = 20;
        if (riskBar) riskBar.style.width = `${riskPct}%`;
        if (controlBar) controlBar.style.width = `${controlPct}%`;
    }

    function calculateTimeLoss() {
        // Block 2 Q3 = Step 8 = Time Per Bag
        const timePerBag = state.answers['q8']?.numeric || 15;
        const totalMins = timePerBag * 10;
        const hours = (totalMins / 60).toFixed(1);

        setSafeText('dynamic_time_per_bag', timePerBag);
        setSafeText('dynamic_time_calc', `${hours} horas`);
    }

    function determineProfile() {
        // Based on Q2 (Qtd)
        // < 30 -> Construção
        // 30-70 -> Expansão
        // > 70 -> Escala

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

    // --- Helpers ---
    function setSafeText(id, text) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    }

    function formatMoney(val) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    }

    function animateMoneyValue(el, to, { durationMs = 900 } = {}) {
        if (!el) return;
        const start = performance.now();
        // tenta capturar um número já exibido (R$ 1.234,00 -> 1234)
        const from = parseFloat(String(el.textContent || '').replace(/[^0-9.-]/g, '')) || 0;
        const delta = to - from;

        function step(now) {
            const t = Math.min(1, (now - start) / durationMs);
            // easing suave
            const eased = 1 - Math.pow(1 - t, 3);
            const current = from + delta * eased;
            el.textContent = formatMoney(Math.max(0, current));
            if (t < 1) requestAnimationFrame(step);
        }

        requestAnimationFrame(step);
    }

    function trackEvent(name, params = {}) {
        if (typeof trk === 'function') trk(name, params);

        // Para o Pixel: tenta disparar eventos padrão quando fizer sentido
        const standard = new Set([
            'PageView',
            'ViewContent',
            'InitiateCheckout',
            'Lead',
            'CompleteRegistration'
        ]);

        if (window.fbq) {
            if (standard.has(name)) {
                window.fbq('track', name, params);
            } else {
                window.fbq('trackCustom', name, params);
            }
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

    init();
});
