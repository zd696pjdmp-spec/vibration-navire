/**
 * VibrationNav - Frontend Application
 * Système de Transmission de Puissance Navale
 */

// ==================== ÉTAT GLOBAL ====================
let currentData = null;
let charts = {};
let animationId = null;
let isAnimating = false;
let animationFrame = 0;

// ==================== CONFIGURATION CHART.JS ====================
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = '#94a3b8';

// ==================== INITIALISATION ====================
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initSliders();
    initButtons();
    initCharts();
    
    // Charger la simulation par défaut
    lancerSimulation();
});

// ==================== ONGLETS ====================
function initTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.tab-panel');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(`panel-${target}`).classList.add('active');
            
            if (target === 'analyse' && currentData) {
                updateAnalysePanel();
            }
        });
    });
}

// ==================== SLIDERS & DEBOUNCE ====================
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const debouncedSimulation = debounce(lancerSimulation, 150);

function initSliders() {
    const sliders = document.querySelectorAll('.slider');
    
    const unitLabels = {
        'I_moteur': 'kg.m²',
        'rpm_nominal': 'tr/min',
        'ordre_excitation': '',
        'L_arbre': 'm',
        'D_arbre': 'mm',
        'c_arbre': 'N.s/m',
        'm_helice': 'kg',
        'nb_pales': '',
        'amplitude_excitation': 'N'
    };
    
    sliders.forEach(slider => {
        const display = document.getElementById(`val-${slider.id}`);
        if (!display) return;
        
        slider.addEventListener('input', () => {
            const unit = unitLabels[slider.id] || '';
            display.textContent = `${slider.value} ${unit}`.trim();
            
            // Si le calcul en temps réel est activé
            if (document.getElementById('chk-temps-reel').checked) {
                debouncedSimulation();
            }
        });
    });
}

function getSliderParams() {
    const params = {};
    document.querySelectorAll('.slider').forEach(slider => {
        let val = parseFloat(slider.value);
        // Convertir mm en m pour D_arbre
        if (slider.id === 'D_arbre') {
            val = val / 1000;
        }
        params[slider.id] = val;
    });
    return params;
}

// ==================== BOUTONS ====================
function initButtons() {
    document.getElementById('btn-simuler').addEventListener('click', lancerSimulation);
    document.getElementById('btn-reset').addEventListener('click', reinitialiser);
    document.getElementById('btn-optimiser').addEventListener('click', lancerOptimisation);
    document.getElementById('btn-play-animation').addEventListener('click', playAnimation);
    document.getElementById('btn-pause-animation').addEventListener('click', pauseAnimation);
}

// ==================== SIMULATION ====================
async function lancerSimulation() {
    const btn = document.getElementById('btn-simuler');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="loading"></span> En cours...';
    btn.classList.add('loading-state');
    
    try {
        const params = getSliderParams();
        
        const response = await fetch('/api/simuler', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parametres: params })
        });
        
        const data = await response.json();
        
        if (data.succes) {
            currentData = data;
            updateKPIs(data.kpi);
            updateCharts(data.resultats);
            updateAnimationData(data.resultats);
            
            // Si l'onglet actif est Analyse, on rafraîchit les droites du diagramme
            const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
            if (activeTab === 'analyse') {
                updateAnalysePanel();
            }
        } else {
            console.error('Erreur simulation:', data.erreur);
            alert('Erreur lors de la simulation: ' + data.erreur);
        }
    } catch (err) {
        console.error('Erreur réseau:', err);
        alert('Erreur de connexion au serveur');
    } finally {
        btn.innerHTML = originalText;
        btn.classList.remove('loading-state');
    }
}

async function reinitialiser() {
    try {
        const response = await fetch('/api/reset', { method: 'POST' });
        const data = await response.json();
        
        if (data.succes) {
            // Reset sliders
            document.querySelectorAll('.slider').forEach(slider => {
                const defaultVal = data.parametres[slider.id];
                if (defaultVal !== undefined) {
                    let displayVal = defaultVal;
                    if (slider.id === 'D_arbre') displayVal = defaultVal * 1000;
                    slider.value = displayVal;
                    const display = document.getElementById(`val-${slider.id}`);
                    if (display) {
                        const unitLabels = {
                            'I_moteur': 'kg.m²', 'rpm_nominal': 'tr/min', 'ordre_excitation': '',
                            'L_arbre': 'm', 'D_arbre': 'mm', 'c_arbre': 'N.s/m',
                            'm_helice': 'kg', 'nb_pales': '', 'amplitude_excitation': 'N'
                        };
                        display.textContent = `${displayVal} ${unitLabels[slider.id] || ''}`.trim();
                    }
                }
            });
            
            document.getElementById('opt-results').style.display = 'none';
            lancerSimulation();
        }
    } catch (err) {
        console.error('Erreur reset:', err);
    }
}

// ==================== OPTIMISATION ====================
async function lancerOptimisation() {
    const btn = document.getElementById('btn-optimiser');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="loading"></span> En cours...';
    btn.disabled = true;
    
    try {
        const obj = document.getElementById('opt-objectif').value;
        const response = await fetch('/api/optimiser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ objectif: obj })
        });
        
        const data = await response.json();
        
        if (data.succes && data.optimisation.succes) {
            const opt = data.optimisation;
            const optSection = document.getElementById('opt-results');
            const optGrid = document.getElementById('opt-params');
            
            optGrid.innerHTML = `
                <div class="opt-card">
                    <div class="opt-card-label">Diamètre Arbre Optimal</div>
                    <div class="opt-card-value">${(opt.parametres_optimaux.D_arbre * 1000).toFixed(1)} <span class="opt-card-unit">mm</span></div>
                </div>
                <div class="opt-card">
                    <div class="opt-card-label">Longueur Arbre Optimale</div>
                    <div class="opt-card-value">${opt.parametres_optimaux.L_arbre.toFixed(2)} <span class="opt-card-unit">m</span></div>
                </div>
                <div class="opt-card">
                    <div class="opt-card-label">Raideur Accouplement</div>
                    <div class="opt-card-value">${(opt.parametres_optimaux.k_accouplement/1000).toFixed(1)} <span class="opt-card-unit">kN/m</span></div>
                </div>
                <div class="opt-card">
                    <div class="opt-card-label">Vibration RMS Cible</div>
                    <div class="opt-card-value">${opt.kpi_optimaux.vibration_totale_rms.toFixed(3)} <span class="opt-card-unit">mm eq</span></div>
                </div>
                <div class="opt-card">
                    <div class="opt-card-label">Marge Excitation Min</div>
                    <div class="opt-card-value">${Math.min(opt.kpi_optimaux.marge_excitation_torsion, opt.kpi_optimaux.marge_excitation_axiale, opt.kpi_optimaux.marge_excitation_laterale).toFixed(1)} <span class="opt-card-unit">%</span></div>
                </div>
                <div class="opt-card">
                    <div class="opt-card-label">Itérations (L-BFGS-B)</div>
                    <div class="opt-card-value">${opt.iterations}</div>
                </div>
            `;
            
            optSection.style.display = 'block';
            optSection.scrollIntoView({ behavior: 'smooth' });
            
            // Appliquer les paramètres optimaux aux sliders
            document.getElementById('D_arbre').value = opt.parametres_optimaux.D_arbre * 1000;
            document.getElementById('val-D_arbre').textContent = (opt.parametres_optimaux.D_arbre * 1000).toFixed(0) + ' mm';
            
            document.getElementById('L_arbre').value = opt.parametres_optimaux.L_arbre;
            document.getElementById('val-L_arbre').textContent = opt.parametres_optimaux.L_arbre.toFixed(1) + ' m';
            
            // Mettre à jour la simulation
            lancerSimulation();
        } else {
            alert('L\'optimisation a échoué: ' + (data.optimisation?.erreur || 'Erreur inconnue'));
        }
    } catch (err) {
        console.error('Erreur optimisation:', err);
        alert('Erreur lors de l\'optimisation');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==================== KPIs ====================
function updateKPIs(kpi) {
    document.getElementById('kpi-amplitude-torsion').textContent = kpi.amplitude_torsion.toFixed(3);
    document.getElementById('kpi-amplitude-axiale').textContent = kpi.amplitude_axiale.toFixed(3);
    document.getElementById('kpi-amplitude-laterale').textContent = kpi.amplitude_laterale.toFixed(3);
    
    // Marges de sécurité combinées
    document.getElementById('kpi-marges').innerHTML = `
        <span style="color:#8b5cf6">T: ${kpi.marge_excitation_torsion.toFixed(0)}%</span> | 
        <span style="color:#06b6d4">A: ${kpi.marge_excitation_axiale.toFixed(0)}%</span> | 
        <span style="color:#f43f5e">L: ${kpi.marge_excitation_laterale.toFixed(0)}%</span>
    `;
    
    const niveauEl = document.getElementById('kpi-niveau');
    const niveauClassEl = document.getElementById('kpi-niveau-classe');
    
    niveauEl.textContent = kpi.niveau_vibration.niveau;
    niveauEl.style.color = kpi.niveau_vibration.couleur;
    niveauClassEl.textContent = `Classe ${kpi.niveau_vibration.classe} (ISO 10816)`;
}

// ==================== CHARTS ====================
function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: false }
        },
        scales: {
            x: {
                grid: { color: 'rgba(148, 163, 184, 0.05)' },
                ticks: { maxTicksLimit: 8, color: '#64748b', font: { size: 10 } }
            },
            y: {
                grid: { color: 'rgba(148, 163, 184, 0.05)' },
                ticks: { color: '#64748b', font: { size: 10 } }
            }
        }
    };
    
    // Chart Torsion
    charts.torsion = new Chart(document.getElementById('chart-torsion'), {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: { ...commonOptions.scales.y, title: { display: true, text: 'Angle (rad)', color: '#64748b' } }
            }
        }
    });
    
    // Chart Axial
    charts.axial = new Chart(document.getElementById('chart-axial'), {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: { ...commonOptions.scales.y, title: { display: true, text: 'Déplacement (m)', color: '#64748b' } }
            }
        }
    });
    
    // Chart Lateral
    charts.lateral = new Chart(document.getElementById('chart-lateral'), {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: { ...commonOptions.scales.y, title: { display: true, text: 'Déplacement (m)', color: '#64748b' } }
            }
        }
    });
    
    // Chart FFT
    charts.fft = new Chart(document.getElementById('chart-fft'), {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                x: { ...commonOptions.scales.x, title: { display: true, text: 'Fréquence (Hz)', color: '#64748b' } },
                y: { ...commonOptions.scales.y, title: { display: true, text: 'Amplitude de Fourier', color: '#64748b' } }
            }
        }
    });
    
    // Chart Campbell (Diagramme de Campbell)
    charts.campbell = new Chart(document.getElementById('chart-campbell'), {
        type: 'line',
        data: { datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { boxWidth: 10, font: { size: 9 }, color: '#94a3b8' }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 200,
                    max: 3000,
                    grid: { color: 'rgba(148, 163, 184, 0.05)' },
                    title: { display: true, text: 'Régime Moteur (RPM)', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' }
                },
                y: {
                    type: 'linear',
                    min: 0,
                    max: 150,
                    grid: { color: 'rgba(148, 163, 184, 0.05)' },
                    title: { display: true, text: 'Fréquence (Hz)', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
    
    // Chart Stacked Area RMS
    charts.heatmap = new Chart(document.getElementById('chart-heatmap'), {
        type: 'line',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { boxWidth: 12, font: { size: 10 }, color: '#94a3b8' }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(148, 163, 184, 0.05)' },
                    ticks: { color: '#94a3b8' },
                    title: { display: true, text: 'Temps (s)', color: '#94a3b8' }
                },
                y: {
                    stacked: true,
                    grid: { color: 'rgba(148, 163, 184, 0.05)' },
                    ticks: { color: '#94a3b8' },
                    title: { display: true, text: 'Amplitudes RMS cumulées (mm / deg eq)', color: '#94a3b8' }
                }
            }
        }
    });
}

function updateCharts(results) {
    const t = results.t;
    
    // Sous-échantillonner uniquement pour l'affichage fluide dans Chart.js (max 500 points)
    const step = Math.max(1, Math.floor(t.length / 500));
    const t_sub = t.filter((_, i) => i % step === 0);
    const sub = (arr) => arr.filter((_, i) => i % step === 0);
    
    // --- TORSION ---
    charts.torsion.data.labels = t_sub.map(v => v.toFixed(2));
    charts.torsion.data.datasets = [
        { label: 'Moteur', data: sub(results.torsion.theta_m), borderColor: '#f97316', backgroundColor: '#f9731610', borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
        { label: 'Arbre', data: sub(results.torsion.theta_a), borderColor: '#3b82f6', backgroundColor: '#3b82f610', borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
        { label: 'Hélice', data: sub(results.torsion.theta_h), borderColor: '#10b981', backgroundColor: '#10b98110', borderWidth: 1.5, pointRadius: 0, tension: 0.3 }
    ];
    charts.torsion.update('none');
    
    // --- AXIAL ---
    charts.axial.data.labels = t_sub.map(v => v.toFixed(2));
    charts.axial.data.datasets = [
        { label: 'Moteur+Arbre', data: sub(results.axial.x_ma), borderColor: '#3b82f6', backgroundColor: '#3b82f610', borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
        { label: 'Hélice', data: sub(results.axial.x_h), borderColor: '#10b981', backgroundColor: '#10b98110', borderWidth: 1.5, pointRadius: 0, tension: 0.3 }
    ];
    charts.axial.update('none');
    
    // --- LATERAL ---
    charts.lateral.data.labels = t_sub.map(v => v.toFixed(2));
    charts.lateral.data.datasets = [
        { label: 'Moteur', data: sub(results.lateral.y_m), borderColor: '#f97316', backgroundColor: '#f9731610', borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
        { label: 'Arbre+Hélice', data: sub(results.lateral.y_ah), borderColor: '#10b981', backgroundColor: '#10b98110', borderWidth: 1.5, pointRadius: 0, tension: 0.3 }
    ];
    charts.lateral.update('none');
    
    // --- FFT (tracé direct depuis le calcul back-end de haute précision) ---
    const fftFreqs = results.fft.freqs;
    const fftStep = Math.max(1, Math.floor(fftFreqs.length / 400));
    
    charts.fft.data.labels = fftFreqs.filter((_, i) => i % fftStep === 0).map(f => f.toFixed(1));
    charts.fft.data.datasets = [
        { label: 'Torsion Hélice', data: results.fft.torsion.filter((_, i) => i % fftStep === 0), borderColor: '#8b5cf6', backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, tension: 0.2 },
        { label: 'Axial Hélice', data: results.fft.axial.filter((_, i) => i % fftStep === 0), borderColor: '#06b6d4', backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, tension: 0.2 },
        { label: 'Latéral Hélice', data: results.fft.lateral.filter((_, i) => i % fftStep === 0), borderColor: '#f43f5e', backgroundColor: 'transparent', borderWidth: 1.5, pointRadius: 0, tension: 0.2 }
    ];
    charts.fft.update('none');
    
    // --- Stacked Area Contributions (RMS evolution over time) ---
    updateStackedAreaChart(results);
}

function updateStackedAreaChart(results) {
    // Calcule les RMS glissantes sur 100 points
    const windowSize = 100;
    const nWindows = Math.floor(results.t.length / windowSize);
    
    const labels = [];
    const dataTorsion = [];
    const dataAxial = [];
    const dataLateral = [];
    
    for (let i = 0; i < nWindows; i++) {
        const start = i * windowSize;
        const end = start + windowSize;
        labels.push(`${(results.t[start]).toFixed(1)}s`);
        
        let sumT = 0, sumA = 0, sumL = 0;
        for (let j = start; j < end; j++) {
            sumT += results.torsion.theta_h[j] ** 2;
            sumA += results.axial.x_h[j] ** 2;
            sumL += results.lateral.y_ah[j] ** 2;
        }
        // Conversion en mm ou degrés équivalents pour le tracé combiné
        dataTorsion.push(Math.sqrt(sumT / windowSize) * (180 / Math.PI)); // Degrés
        dataAxial.push(Math.sqrt(sumA / windowSize) * 1000); // mm
        dataLateral.push(Math.sqrt(sumL / windowSize) * 1000); // mm
    }
    
    const step = Math.max(1, Math.floor(nWindows / 20));
    
    charts.heatmap.data.labels = labels.filter((_, i) => i % step === 0);
    charts.heatmap.data.datasets = [
        { label: 'Torsion Hélice (degrés)', data: dataTorsion.filter((_, i) => i % step === 0), fill: true, backgroundColor: 'rgba(139, 92, 246, 0.25)', borderColor: '#8b5cf6', borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
        { label: 'Axial Hélice (mm)', data: dataAxial.filter((_, i) => i % step === 0), fill: true, backgroundColor: 'rgba(6, 182, 212, 0.25)', borderColor: '#06b6d4', borderWidth: 1.5, pointRadius: 0, tension: 0.3 },
        { label: 'Latéral Hélice (mm)', data: dataLateral.filter((_, i) => i % step === 0), fill: true, backgroundColor: 'rgba(244, 63, 94, 0.25)', borderColor: '#f43f5e', borderWidth: 1.5, pointRadius: 0, tension: 0.3 }
    ];
    charts.heatmap.update('none');
}

function updateCampbellDiagram(frequences) {
    const order = parseFloat(document.getElementById('ordre_excitation').value);
    const blades = parseFloat(document.getElementById('nb_pales').value);
    const currentRpm = parseFloat(document.getElementById('rpm_nominal').value);
    
    const datasets = [];
    
    // Droite 1x rotation (balourd)
    datasets.push({
        label: '1x RPM (Balourd)',
        data: [{ x: 200, y: 200/60 }, { x: 3000, y: 3000/60 }],
        borderColor: '#3b82f6',
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false
    });
    
    // Droite excitation moteur (ordre harmonique)
    datasets.push({
        label: `Excitation Moteur (${order}x)`,
        data: [{ x: 200, y: order*200/60 }, { x: 3000, y: order*3000/60 }],
        borderColor: '#f97316',
        borderWidth: 2,
        pointRadius: 0,
        fill: false
    });
    
    // Droite excitation pales (fréquence de passage)
    datasets.push({
        label: `Passage Pales (${blades}x)`,
        data: [{ x: 200, y: blades*200/60 }, { x: 3000, y: blades*3000/60 }],
        borderColor: '#10b981',
        borderWidth: 2,
        pointRadius: 0,
        fill: false
    });
    
    // Fréquences propres structurelles (Lignes horizontales statiques)
    // Torsion
    frequences.torsion.forEach((f, idx) => {
        datasets.push({
            label: `Modes Torsion (${f.toFixed(1)} Hz)`,
            data: [{ x: 200, y: f }, { x: 3000, y: f }],
            borderColor: '#8b5cf6',
            borderWidth: 1.2,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false
        });
    });
    // Axial
    frequences.axial.forEach((f, idx) => {
        datasets.push({
            label: `Modes Axiaux (${f.toFixed(1)} Hz)`,
            data: [{ x: 200, y: f }, { x: 3000, y: f }],
            borderColor: '#06b6d4',
            borderWidth: 1.2,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false
        });
    });
    // Lateral
    frequences.lateral.forEach((f, idx) => {
        datasets.push({
            label: `Modes Latéraux (${f.toFixed(1)} Hz)`,
            data: [{ x: 200, y: f }, { x: 3000, y: f }],
            borderColor: '#f43f5e',
            borderWidth: 1.2,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false
        });
    });
    
    // Ligne verticale désignant le régime actuel du moteur
    datasets.push({
        label: `Régime Actuel (${currentRpm} tr/min)`,
        data: [{ x: currentRpm, y: 0 }, { x: currentRpm, y: 150 }],
        borderColor: '#ffffff',
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        borderDash: [2, 2]
    });
    
    charts.campbell.data.datasets = datasets;
    charts.campbell.update('none');
}

// ==================== ANIMATION CANVAS DYNAMIQUE ====================
let animData = null;

function updateAnimationData(results) {
    animData = results;
    animationFrame = 0;
}

function playAnimation() {
    if (!animData) return;
    if (isAnimating) return;
    
    isAnimating = true;
    const canvas = document.getElementById('animation-canvas');
    const ctx = canvas.getContext('2d');
    
    const torsion = animData.torsion;
    const lateral = animData.lateral;
    const nPoints = torsion.theta_m.length;
    const rpm = parseFloat(document.getElementById('rpm_nominal').value);
    
    function draw() {
        if (!isAnimating) return;
        
        ctx.fillStyle = '#090e17';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const i = animationFrame % nPoints;
        const t_val = animData.t[i];
        
        // Calcul de la rotation uniforme continue (bulk rotation)
        const omega = 2 * Math.PI * rpm / 60; // rad/s
        const theta_bulk = omega * t_val;
        
        const scale = 140; // Facteur d'échelle pour l'affichage de la déflexion flexionnelle
        const centerY = canvas.height / 2;
        
        const moteurX = 150;
        const accouplementX = 350;
        const palierX = 580;
        const heliceX = 820;
        
        // Déplacements latéraux interpolés
        const latM = lateral.y_m[i] * scale;
        const latA = (lateral.y_m[i] + lateral.y_ah[i]) * 0.5 * scale;
        const latP = (lateral.y_m[i] + 3*lateral.y_ah[i]) * 0.25 * scale;
        const latH = lateral.y_ah[i] * scale;
        
        // ------------------ DESSIN DU FOND / GRILLE ------------------
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
        ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += 50) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += 50) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }
        
        // Ligne de référence neutre
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(50, centerY); ctx.lineTo(910, centerY); ctx.stroke();
        ctx.setLineDash([]);
        
        // ------------------ DESSIN DE LA LIGNE D'ARBRE ------------------
        // On dessine l'arbre déformé selon une spline ou des segments doux
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.4)';
        ctx.lineWidth = 18;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(moteurX, centerY + latM);
        ctx.bezierCurveTo(accouplementX, centerY + latA, palierX, centerY + latP, heliceX, centerY + latH);
        ctx.stroke();
        
        // Cœur métallique intérieur de l'arbre
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // ------------------ DESSIN DU MOTEUR (AVEC PISTONS) ------------------
        ctx.save();
        ctx.translate(moteurX - 40, centerY + latM);
        // Bloc moteur
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-45, -35, 90, 70, 6);
        ctx.fill(); ctx.stroke();
        
        // Animation des pistons (cylindres) en fonction de l'angle
        const piston1 = Math.sin(theta_bulk * 2) * 15;
        const piston2 = Math.sin(theta_bulk * 2 + Math.PI) * 15;
        
        ctx.fillStyle = '#f97316';
        ctx.fillRect(-22, -48 - piston1, 10, 15); // Piston 1
        ctx.fillRect(12, -48 - piston2, 10, 15);  // Piston 2
        
        // Bielles
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-17, -35); ctx.lineTo(-17, -33 - piston1);
        ctx.moveTo(17, -35); ctx.lineTo(17, -33 - piston2);
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MOTEUR', 0, 5);
        ctx.restore();
        
        // ------------------ DESSIN DE L'ACCOUPLEMENT ------------------
        ctx.save();
        ctx.translate(accouplementX, centerY + latA);
        ctx.rotate(theta_bulk + torsion.theta_a[i] * 5); // Torsion amplifiée 5x
        
        ctx.fillStyle = '#475569';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 24, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        
        // Repères de rotation pour visualiser la torsion
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(24, 0);
        ctx.moveTo(0, 0); ctx.lineTo(-24, 0);
        ctx.stroke();
        ctx.restore();
        
        // ------------------ DESSIN DU PALIER SUPPORT ------------------
        ctx.save();
        ctx.translate(palierX, centerY + latP);
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-12, -22, 24, 44, 4);
        ctx.fill(); ctx.stroke();
        
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        
        // ------------------ DESSIN DE L'HÉLICE (EFFET DE FLOU ROTATIF) ------------------
        ctx.save();
        ctx.translate(heliceX, centerY + latH);
        
        // Rotation réelle de l'hélice avec vibrations de torsion amplifiées
        const twistAngle = theta_bulk + torsion.theta_h[i] * 5.0;
        ctx.rotate(twistAngle);
        
        // Pales de l'hélice (3D Shader en Canvas 2D avec dégradé radial)
        const blades = parseFloat(document.getElementById('nb_pales').value) || 4;
        for (let b = 0; b < blades; b++) {
            ctx.save();
            ctx.rotate((b / blades) * Math.PI * 2);
            
            const gradient = ctx.createLinearGradient(0, -10, 45, 10);
            gradient.addColorStop(0, '#10b981');
            gradient.addColorStop(0.5, '#059669');
            gradient.addColorStop(1, '#047857');
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(30, 0, 30, 10, 0.1, 0, Math.PI * 2);
            ctx.fill();
            
            // Reflet métallique sur le bord de pale
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            ctx.restore();
        }
        
        // Moyeu de l'hélice
        const hubGradient = ctx.createRadialGradient(0, 0, 2, 0, 0, 10);
        hubGradient.addColorStop(0, '#ffffff');
        hubGradient.addColorStop(0.7, '#10b981');
        hubGradient.addColorStop(1, '#064e3b');
        ctx.fillStyle = hubGradient;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
        // ------------------ TEXTES ET LÉGENDES DANS CANVAS ------------------
        ctx.fillStyle = '#f8fafc';
        ctx.font = '11px sans-serif';
        ctx.fillText(`Temps : ${t_val.toFixed(3)} s`, 24, 32);
        ctx.fillText(`Angle Hélice : ${(torsion.theta_h[i]*180/Math.PI).toFixed(2)}°`, 24, 50);
        ctx.fillText(`Déflexion Latérale : ${(lateral.y_ah[i]*1000).toFixed(2)} mm`, 24, 68);
        
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'right';
        ctx.fillText(`Vitesse nominale : ${rpm} tr/min (Torsion amplifiée 5x)`, canvas.width - 24, 32);
        ctx.textAlign = 'left';
        
        animationFrame++;
        animationId = requestAnimationFrame(draw);
    }
    
    draw();
}

function pauseAnimation() {
    isAnimating = false;
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

// ==================== PANEL ANALYSE ====================
async function updateAnalysePanel() {
    try {
        const response = await fetch('/api/frequences');
        const data = await response.json();
        
        if (!data.succes) return;
        
        const freq = data.frequences;
        const props = data.proprietes_arbre;
        
        // Fréquences propres - Torsion
        const torsionEl = document.getElementById('freq-torsion');
        torsionEl.innerHTML = freq.torsion.map((f, i) => `
            <div class="freq-item">
                <span class="freq-label">Mode ${i+1}</span>
                <span class="freq-value">${f.toFixed(2)} Hz</span>
            </div>
        `).join('');
        
        // Fréquences propres - Axial
        const axialEl = document.getElementById('freq-axial');
        axialEl.innerHTML = freq.axial.map((f, i) => `
            <div class="freq-item">
                <span class="freq-label">Mode ${i+1}</span>
                <span class="freq-value">${f.toFixed(2)} Hz</span>
            </div>
        `).join('');
        
        // Fréquences propres - Latéral
        const lateralEl = document.getElementById('freq-lateral');
        lateralEl.innerHTML = freq.lateral.map((f, i) => `
            <div class="freq-item">
                <span class="freq-label">Mode ${i+1}</span>
                <span class="freq-value">${f.toFixed(2)} Hz</span>
            </div>
        `).join('');
        
        // Fréquences d'excitation
        const excEl = document.getElementById('freq-excitation');
        excEl.innerHTML = `
            <div class="freq-item">
                <span class="freq-label">Ordre Moteur</span>
                <div>
                    <span class="freq-value" style="color:#f97316">${freq.excitation_torsion.toFixed(2)} Hz</span>
                    <span class="freq-excitation">${document.getElementById('ordre_excitation').value}x</span>
                </div>
            </div>
            <div class="freq-item">
                <span class="freq-label">Fréquence Pales</span>
                <div>
                    <span class="freq-value" style="color:#10b981">${freq.excitation_pales.toFixed(2)} Hz</span>
                    <span class="freq-excitation">${document.getElementById('nb_pales').value}p</span>
                </div>
            </div>
            <div class="freq-item">
                <span class="freq-label">Rotation Arbre</span>
                <div>
                    <span class="freq-value" style="color:#3b82f6">${freq.excitation_rotation.toFixed(2)} Hz</span>
                    <span class="freq-excitation">1x</span>
                </div>
            </div>
        `;
        
        // Propriétés de l'arbre
        const propsEl = document.getElementById('props-arbre');
        propsEl.innerHTML = `
            <div class="prop-item">
                <span class="prop-label">Section Transversale</span>
                <span class="prop-value">${(props.S * 1e4).toFixed(1)} cm²</span>
            </div>
            <div class="prop-item">
                <span class="prop-label">Masse de l'arbre</span>
                <span class="prop-value">${props.m_arbre.toFixed(1)} kg</span>
            </div>
            <div class="prop-item">
                <span class="prop-label">Raideur de Torsion</span>
                <span class="prop-value">${(props.k_torsion / 1000).toFixed(1)} kN.m/rad</span>
            </div>
            <div class="prop-item">
                <span class="prop-label">Raideur de Flexion</span>
                <span class="prop-value">${(props.k_flexion / 1000).toFixed(1)} kN/m</span>
            </div>
            <div class="prop-item">
                <span class="prop-label">Raideur Axiale</span>
                <span class="prop-value">${(props.k_axial / 1e6).toFixed(1)} MN/m</span>
            </div>
            <div class="prop-item">
                <span class="prop-label">Inertie de Flexion (I)</span>
                <span class="prop-value">${(props.I_flexion * 1e8).toFixed(1)} cm⁴</span>
            </div>
        `;
        
        // Mettre à jour le diagramme de Campbell
        updateCampbellDiagram(freq);
        
    } catch (err) {
        console.error('Erreur analyse:', err);
    }
}
