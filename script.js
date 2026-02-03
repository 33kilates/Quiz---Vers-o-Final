document.addEventListener('DOMContentLoaded', () => {

    // --- State Management ---
    const state = {
        answers: {},
        logic: {
            actives: 10,
            lost: 0,
            repoHours: 1,
            avgLife: 3, // months
            profit: 150,
            churnPct: 0,
            repoCost: 0,
            lostProfitYear: 0
        },
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

        // Track Start
        safeTrackEvent('quiz_start', {
            event_id: 'QZ_START',
            quiz_name: 'diagnostico_consignado',
            origem: 'meta_ads'
        });
    }

    // --- Core Navigation ---
    window.nextScreen = function () {
        if (state.currentStepIndex < state.screens.length - 1) {
            state.currentStepIndex++;
            updateView();
        }
    };

    window.selectOption = function (questionId, value, numericValue = null, tag = null) {
        // 1. Save Answer
        state.answers[questionId] = {
            value: value,
            numeric: numericValue,
            tag: tag
        };

        // 2. Logic Updates (Immediate)
        if (questionId === 'P3_vazamento_base') state.logic.lost = numericValue;
        if (questionId === 'P4_tempo_ativo') state.logic.avgLife = numericValue;
        if (questionId === 'P5_lucro') state.logic.profit = numericValue;

        // 3. Track Answer
        safeTrackEvent('quiz_answer', {
            event_id: `QZ_ANSWER_${questionId}`,
            pergunta: questionId,
            resposta: value
        });

        // 4. Move Next
        setTimeout(nextScreen, 300);
    };

    // --- Special Questions Handlers ---
    window.setQ3Part1 = function (val) {
        state.logic.actives = val;
        // Visual Selection
        event.target.classList.add('selected'); // Simple visual feedback

        // Show Part 2
        document.getElementById('q3_part2').style.display = 'block';
    };

    window.setQ4Part1 = function (val) {
        state.logic.repoHours = val;
        event.target.classList.add('selected');
        document.getElementById('q4_part2').style.display = 'block';
    };

    // --- Calculating Screen Logic ---
    window.showCalculatingScreen = function () {
        const calcIdx = state.screens.findIndex(s => s.id === 'screen_calculating');
        if (calcIdx === -1) { determineProfile(); showResult(); return; }

        state.currentStepIndex = calcIdx;
        updateView();

        safeTrackEvent('quiz_calculation_start', { event_id: 'QZ_CALC_START' });

        // Animation
        const fill = document.getElementById('calc_fill');
        const text = document.getElementById('calc_text_step');

        if (fill) {
            const duration = 2500; // 2.5s total calculation

            // CSS Transition
            fill.style.transition = `width ${duration}ms ease-out`;
            setTimeout(() => { fill.style.width = '100%'; }, 50);

            // Text Steps
            const steps = [
                "medindo sua base que vaza…",
                "calculando seu custo de recomeço…",
                "projetando lucro que não fica…",
                "identificando seu perfil de operação…",
                "montando sua Equipe Híbrida ideal…"
            ];

            let counter = 0;
            const stepInterval = setInterval(() => {
                if (counter < steps.length) {
                    if (text) text.innerText = steps[counter];
                    counter++;
                }
            }, duration / steps.length);

            // Finish
            setTimeout(() => {
                clearInterval(stepInterval);
                runFinalCalculations(); // Ensure final numbers are ready
                determineProfile();

                safeTrackEvent('quiz_calculation_end', {
                    event_id: 'QZ_CALC_END',
                    perfil_empresario: state.profile,
                    vazamento_percentual: state.logic.churnPct,
                    dinheiro_deixa_ganhar_ano: state.logic.lostProfitYear
                });

                showResult();
            }, duration);
        } else {
            runFinalCalculations();
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

            safeTrackEvent('quiz_result_view', {
                event_id: `QZ_RESULT_${state.profile.replace(/ /g, '_')}`,
                perfil: state.profile,
                gargalo_principal: getGargalo()
            });
        }
    };

    window.goToCheckout = function () {
        safeTrackEvent('quiz_offer_click', {
            event_id: 'QZ_OFFER_CLICK',
            perfil_empresario: state.profile,
            gargalo_principal: getGargalo(),
            destino: "ticto_checkout"
        });

        const checkoutBaseUrl = "https://pay.ticto.com.br/CHECKOUT_ID"; // Replace with real ID
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
        // UI Reset
        state.screens.forEach(el => el.classList.remove('is-active'));
        const currentScreen = state.screens[state.currentStepIndex];
        currentScreen.classList.add('is-active');
        window.scrollTo(0, 0);

        const screenDetails = currentScreen.id;

        // Run Logic for Insights
        if (screenDetails === 'screen_insight3') runInsight3();
        if (screenDetails === 'screen_insight4') runInsight4();
        if (screenDetails === 'screen_insight6') runInsight6();
        if (screenDetails === 'screen_offer') runOfferLogic();

        // Update Progress Bar
        updateProgress(currentScreen.dataset.step);

        // Track Step View
        if (screenDetails !== 'screen_calculating') {
            let stepName = screenDetails.replace('screen_', '').toUpperCase();
            safeTrackEvent('quiz_step_view', {
                event_id: `QZ_STEP_${stepName}`,
                step_name: stepName
            });
        }
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
            percent = Math.min((state.currentStepIndex / state.screens.length) * 100, 95);
        } else if (step === 'result' || step === 'offer') {
            percent = 100;
            text = "CONCLUSÃO";
        } else {
            const num = parseFloat(step);
            if (!isNaN(num)) {
                // ~12 steps total logic
                percent = (num / 12) * 100;
                text = `ETAPA ${num} DE 6`;
            }
        }
        progressBar.style.width = `${percent}%`;
        progressText.innerText = text;
    }

    // --- Calculation Logic (Insights) ---
    function runInsight3() {
        const l = state.logic.lost;
        const a = state.logic.actives;
        let churn = 0;
        if (a > 0) churn = (l / a) * 100;
        state.logic.churnPct = churn;

        setSafeText('disp_actives', a);
        setSafeText('disp_lost', l);

        const el = document.getElementById('calc_churn_pct');
        if (el) animateCountUp(el, 0, churn, 1500, false, '%');
    }

    function runInsight4() {
        const l = state.logic.lost;
        const h = state.logic.repoHours;
        const totalHours = l * h;

        const el = document.getElementById('calc_hours_lost');
        if (el) animateCountUp(el, 0, totalHours, 1500, false, ' horas');
    }

    function runInsight6() {
        const l = state.logic.lost;
        const p = state.logic.profit;
        const t = state.logic.avgLife; // retention months

        const ltv = p * t;
        const lostAnnual = 12 * l * ltv;
        state.logic.lostProfitYear = lostAnnual;

        setSafeText('disp_profit', formatMoney(p));
        setSafeText('disp_retention', `${t} meses`);
        setSafeText('disp_lost_text', l);

        const elLtv = document.getElementById('calc_ltv');
        if (elLtv) animateCountUp(elLtv, 0, ltv, 1000, true);

        const elYear = document.getElementById('calc_lost_profit_yr');
        if (elYear) animateCountUp(elYear, 0, lostAnnual, 2000, true, ' /ano');
    }

    function runFinalCalculations() {
        // Ensure all logic is up to date
    }

    function runOfferLogic() {
        // Populate Mini LP ROI Card
        setSafeText('roi_churn', `${state.logic.churnPct.toFixed(1)}%`);
        setSafeText('roi_hours', (state.logic.lost * state.logic.repoHours));
        setSafeText('roi_money', formatMoney(state.logic.lostProfitYear));
    }

    function determineProfile() {
        const a = state.logic.actives;
        let profile = "";
        let diagText = "";
        let teamHtml = "";
        let nextStep = "";
        let ctaText = "Ver a solução";

        // 1. Profile Logic
        if (a > 100) {
            profile = "Empresário em Escala";
            diagText = `Seu diagnóstico é direto: <strong>Você já opera em volume.</strong><br>E paga caro pela falta de previsibilidade.<br><br>
            Em escala, “gente saindo” não é normal. É imposto silencioso.<br><br>
            Sem método de seleção, o custo indireto sobe, a equipe vira amortecedor de erro e o crescimento vira desgaste.`;

            teamHtml = `<li>✅ <strong>Estáveis</strong> como “coluna” da operação</li>
                        <li>✅ <strong>Empreendedoras</strong> como “motor” de expansão</li>
                        <li>✅ <strong>Sprinters</strong> como “picos controlados” (campanhas/datas)</li>`;

            nextStep = "Você não precisa recrutar mais. Você precisa selecionar e distribuir função com critério repetível.";
            ctaText = "Parar de pagar imposto silencioso de rotatividade";

        } else if (a > 30) {
            profile = "Empresário em Expansão";
            diagText = `Seu diagnóstico mostra um alerta: <strong>Você já cresceu. Mas está pagando um preço invisível por isso.</strong><br><br>
            Isso é o furo no balde. Você trabalha para manter — não para avançar.<br><br>
            Você tem Estáveis segurando tudo, mas um volume alto de perfis que drenam energia (churn). Quando você trata todo mundo igual, sua energia vai pro resgate e o risco cresce.`;

            teamHtml = `<li>✅ Aumentar <strong>Estáveis</strong> (coluna do caixa)</li>
                        <li>✅ Criar trilha clara para <strong>Empreendedoras</strong> (crescer sem quebrar)</li>
                        <li>✅ Usar <strong>Sprinters</strong> como aceleração com limite (não como base)</li>`;

            nextStep = "Você não precisa desacelerar. Você precisa trocar “decisão emocional” por “decisão por comportamento”.";
            ctaText = "Organizar minha base antes de crescer mais";

        } else {
            profile = "Empresário em Construção";
            diagText = `Seu diagnóstico é claro: <strong>Você ainda não tem um problema grande.</strong><br>Mas está construindo exatamente o tipo de base que vira um problema grande depois.<br><br>
            Hoje, o vazamento parece pequeno e o lucro que some passa despercebido. É assim que os problemas começam: quando o negócio ainda parece “sob controle”.`;

            teamHtml = `<li>✅ Mais <strong>Estáveis</strong> para segurar previsibilidade</li>
                        <li>✅ Poucas <strong>Empreendedoras</strong> para puxar crescimento controlado</li>
                        <li>⚠️ <strong>Sprinters</strong> só com regra clara (senão viram vazamento)</li>`;

            nextStep = "Você não precisa de mais gente. Você precisa de critério repetível antes de liberar responsabilidade.";
            ctaText = "Evitar que esse problema escale comigo";
        }

        state.profile = profile;
        setSafeText('result_profile_title', profile);

        const dEl = document.getElementById('result_diagnosis_text');
        if (dEl) dEl.innerHTML = diagText;

        const tEl = document.getElementById('result_hybrid_team');
        if (tEl) tEl.innerHTML = teamHtml;

        setSafeText('result_next_step', nextStep);
        setSafeText('result_cta_button', ctaText);

        // Math
        setSafeText('result_churn', `${state.logic.churnPct.toFixed(1)}%`);
        setSafeText('result_time', `${state.logic.lost * state.logic.repoHours} horas`);
        setSafeText('result_lost_money', formatMoney(state.logic.lostProfitYear));
    }

    function getGargalo() {
        if (state.logic.churnPct > 20) return "Base que vaza";
        const m = state.answers['P6_metodo_decisao']?.tag || '';
        if (m === 'feeling' || m === 'sem_criterio') return "Decisão cedo demais";
        if (state.answers['P2_perfis_revendedoras']?.tag === 'concentracao') return "Dependência perigosa de poucas";
        return "Gestão de Risco";
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
                        if (scrollY > 300) cta.classList.add('visible');
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
                el.innerText = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentVal) + suffix;
            } else {
                el.innerText = currentVal.toFixed(1).replace('.', ',') + suffix;
            }

            if (progress < 1) {
                window.requestAnimationFrame(step);
            } else {
                if (isCurrency) {
                    el.innerText = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(end) + suffix;
                } else {
                    el.innerText = end.toFixed(1).replace('.', ',') + suffix;
                }
            }
        };
        window.requestAnimationFrame(step);
    }

    function setSafeText(id, text) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    }

    function formatMoney(val) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    }

    function safeTrackEvent(eventName, params = {}) {
        try {
            if (typeof trk === 'function') trk(eventName, params);
            console.log(`[Dimpple] ${eventName}`, params);
        } catch (e) {
            console.warn(`[Track Fail] ${eventName}`, e);
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
