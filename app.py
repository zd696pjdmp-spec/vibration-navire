"""
VibrationNav - Modélisation et Simulation des Vibrations
dans les Systèmes de Transmission de Puissance Navals

Backend Python Flask avec modèle physique RK4
"""

from flask import Flask, render_template, jsonify, request
import numpy as np
from scipy.optimize import minimize_scalar, minimize
import json

app = Flask(__name__)


class TransmissionNavaleModel:
    """
    Modèle physique d'un système de transmission de puissance navire.
    
    Système : Moteur -> Accouplement -> Arbre -> Hélice
    
    Vibrations modélisées :
    1. Vibrations de torsion (rotation)
    2. Vibrations axiales (longitudinales)
    3. Vibrations latérales (transversales)
    
    Méthode : Runge-Kutta d'ordre 4 (RK4)
    """
    
    def __init__(self):
        # Paramètres par défaut du système
        self.params = {
            # --- MOTEUR ---
            'I_moteur': 2.5,        # Inertie moteur (kg.m²)
            'k_moteur': 50000,      # Raideur accouplement moteur (N.m/rad)
            'c_moteur': 150,        # Amortissement accouplement moteur (N.m.s/rad)
            'rpm_nominal': 1200,    # Régime nominal moteur (tr/min)
            'ordre_excitation': 4,  # Ordre d'excitation (4 cylindres)
            
            # --- ARBRE ---
            'L_arbre': 4.0,         # Longueur arbre (m)
            'D_arbre': 0.15,        # Diamètre arbre (m)
            'E_acier': 210e9,       # Module Young acier (Pa)
            'G_acier': 80e9,        # Module de cisaillement acier (Pa)
            'rho_acier': 7850,      # Masse volumique acier (kg/m³)
            'c_arbre': 50,          # Amortissement interne arbre (N.s/m)
            
            # --- ACCOUPLENT ELASTIQUE ---
            'k_accouplement': 200000,  # Raideur accouplement (N/m)
            'c_accouplement': 800,     # Amortissement accouplement (N.s/m)
            'm_accouplement': 5.0,     # Masse accouplement (kg)
            
            # --- HELICE ---
            'm_helice': 45.0,       # Masse hélice (kg)
            'I_helice': 8.0,        # Inertie hélice (kg.m²)
            'k_helice': 30000,      # Raideur appui hélice (N/m)
            'c_helice': 200,        # Amortissement hélice (N.s/m)
            'nb_pales': 4,          # Nombre de pales
            
            # --- PALIERS ---
            'k_palier': 500000,     # Raideur palier (N/m)
            'c_palier': 1200,       # Amortissement palier (N.s/m)
            
            # --- SIMULATION ---
            't_final': 10.0,        # Temps final simulation (s)
            'dt': 0.001,            # Pas de temps (s)
            'amplitude_excitation': 50.0  # Amplitude force excitation (N)
        }
    
    def calculer_proprietes_arbre(self):
        """Calcule les propriétés mécaniques de l'arbre"""
        p = self.params
        
        # Section de l'arbre
        S = np.pi * (p['D_arbre']/2)**2
        
        # Moment d'inertie de section (flexion)
        I_flexion = np.pi * p['D_arbre']**4 / 64
        
        # Moment d'inertie polaire (torsion)
        J_torsion = np.pi * p['D_arbre']**4 / 32
        
        # Masse de l'arbre
        m_arbre = p['rho_acier'] * S * p['L_arbre']
        
        # Raideur en torsion
        k_torsion = p['G_acier'] * J_torsion / p['L_arbre']
        
        # Raideur en flexion (modèle poutre encastrée-libre)
        k_flexion = 3 * p['E_acier'] * I_flexion / p['L_arbre']**3
        
        # Raideur axiale
        k_axial = p['E_acier'] * S / p['L_arbre']
        
        return {
            'S': S,
            'I_flexion': I_flexion,
            'J_torsion': J_torsion,
            'm_arbre': m_arbre,
            'k_torsion': k_torsion,
            'k_flexion': k_flexion,
            'k_axial': k_axial
        }
    
    def forces_excitation(self, t):
        """
        Calcule les forces d'excitation du système.
        
        Sources d'excitation :
        1. Couple moteur pulsatoire (ordre d'excitation)
        2. Efforts hélice (fréquence de passage des pales)
        """
        p = self.params
        omega_moteur = 2 * np.pi * p['rpm_nominal'] / 60  # rad/s
        
        # Excitation torsionnelle (moteur)
        freq_torsion = p['ordre_excitation'] * omega_moteur / (2 * np.pi)
        T_exc = p['amplitude_excitation'] * np.sin(2 * np.pi * freq_torsion * t)
        
        # Excitation axiale (hélice - fréquence de passage de pales)
        freq_pales = p['nb_pales'] * omega_moteur / (2 * np.pi)
        F_axial = p['amplitude_excitation'] * 2 * np.sin(2 * np.pi * freq_pales * t)
        
        # Excitation latérale (déséquilibre rotatif)
        omega_rot = omega_moteur
        F_lat = p['amplitude_excitation'] * 0.5 * np.sin(omega_rot * t)
        
        return T_exc, F_axial, F_lat, freq_torsion, freq_pales
    
    def equations_mouvement_torsion(self, state, t, props):
        """
        Équations différentielles pour les vibrations de torsion.
        
        État : [theta_m, dtheta_m, theta_a, dtheta_a, theta_h, dtheta_h]
        theta_m = angle moteur
        theta_a = angle accouplement/arbre
        theta_h = angle hélice
        """
        p = self.params
        k_t = props['k_torsion']
        
        theta_m, dtheta_m, theta_a, dtheta_a, theta_h, dtheta_h = state
        
        T_exc, _, _, _, _ = self.forces_excitation(t)
        
        I_m = p['I_moteur']
        I_h = p['I_helice']
        m_a = props['m_arbre'] * (p['D_arbre']/2)**2 / 3  # Inertie équivalente arbre
        
        # Équations du mouvement
        ddtheta_m = (T_exc - p['c_moteur'] * (dtheta_m - dtheta_a) 
                     - p['k_moteur'] * (theta_m - theta_a)) / I_m
        
        ddtheta_a = (p['c_moteur'] * (dtheta_m - dtheta_a) 
                     + p['k_moteur'] * (theta_m - theta_a)
                     - p['c_arbre'] * (dtheta_a - dtheta_h)
                     - k_t * (theta_a - theta_h)) / (m_a + 1e-6)
        
        ddtheta_h = (p['c_arbre'] * (dtheta_a - dtheta_h) 
                     + k_t * (theta_a - theta_h)
                     - p['c_helice'] * dtheta_h
                     - p['k_helice'] * theta_h) / p['I_helice']
        
        return [dtheta_m, ddtheta_m, dtheta_a, ddtheta_a, dtheta_h, ddtheta_h]
    
    def equations_mouvement_axial(self, state, t, props):
        """
        Équations différentielles pour les vibrations axiales (longitudinales).
        
        Modèle 2 masses : Moteur + Arbre ---- Accouplement ---- Hélice
        État : [x_ma, dx_ma, x_h, dx_h]
        x_ma = déplacement côté moteur/arbre (masse combinée)
        x_h = déplacement hélice
        """
        p = self.params
        
        x_ma, dx_ma, x_h, dx_h = state
        
        _, F_axial, _, _, _ = self.forces_excitation(t)
        
        # Masse effective côté moteur (moteur + arbre + accouplement)
        m_ma = p['I_moteur'] * 0.5 + props['m_arbre'] + p['m_accouplement']
        # Masse hélice
        m_h = p['m_helice']
        
        # Raideur effective axiale (accouplement en série avec arbre)
        k_eff = 1.0 / (1.0 / p['k_accouplement'] + 1.0 / max(props['k_axial'], 1e6))
        # Amortissement effectif
        c_eff = p['c_accouplement'] + p['c_arbre']
        
        ddx_ma = (F_axial - k_eff * (x_ma - x_h) - c_eff * (dx_ma - dx_h)) / m_ma
        
        ddx_h = (k_eff * (x_ma - x_h) + c_eff * (dx_ma - dx_h) 
                 - p['k_helice'] * x_h - p['c_helice'] * dx_h) / m_h
        
        return [dx_ma, ddx_ma, dx_h, ddx_h]
    
    def equations_mouvement_lateral(self, state, t, props):
        """
        Équations différentielles pour les vibrations latérales (transversales).
        
        Modèle 2 masses : Moteur ---- Palier ---- Arbre+Hélice
        État : [y_m, dy_m, y_ah, dy_ah]
        y_m = déplacement moteur
        y_ah = déplacement arbre+hélice (masse combinée)
        """
        p = self.params
        
        y_m, dy_m, y_ah, dy_ah = state
        
        _, _, F_lat, _, _ = self.forces_excitation(t)
        
        # Masse effective moteur
        m_m = p['I_moteur'] * 0.3 + 50  # masse effective avec inertie
        # Masse effective arbre + hélice
        m_ah = props['m_arbre'] + p['m_accouplement'] + p['m_helice']
        
        # Raideur effective latérale (palier + flexion arbre)
        k_eff = 1.0 / (1.0 / p['k_palier'] + 1.0 / max(props['k_flexion'], 1e3))
        c_eff = p['c_palier'] + p['c_arbre']
        
        ddy_m = (F_lat - k_eff * (y_m - y_ah) - c_eff * (dy_m - dy_ah)) / m_m
        
        ddy_ah = (k_eff * (y_m - y_ah) + c_eff * (dy_m - dy_ah) 
                  - p['k_helice'] * y_ah - p['c_helice'] * dy_ah) / m_ah
        
        return [dy_m, ddy_m, dy_ah, ddy_ah]
    
    def rk4_step(self, f, state, t, dt, props):
        """Un pas de Runge-Kutta d'ordre 4"""
        k1 = np.array(f(state, t, props))
        k2 = np.array(f(state + 0.5*dt*k1, t + 0.5*dt, props))
        k3 = np.array(f(state + 0.5*dt*k2, t + 0.5*dt, props))
        k4 = np.array(f(state + dt*k3, t + dt, props))
        
        return state + (dt / 6.0) * (k1 + 2*k2 + 2*k3 + k4)
    
    def simuler(self, custom_params=None):
        """
        Lance la simulation complète avec RK4.
        
        Retourne les résultats pour les 3 types de vibrations.
        """
        if custom_params:
            self.params.update(custom_params)
        
        p = self.params
        props = self.calculer_proprietes_arbre()
        
        # Vecteur temps
        t = np.arange(0, p['t_final'], p['dt'])
        n_steps = len(t)
        
        # Conditions initiales nulles
        state_torsion = np.zeros(6)
        state_axial = np.zeros(4)
        state_lateral = np.zeros(4)
        
        # Tableaux complets pour le calcul précis de la FFT sans aliasing
        theta_h_full = np.zeros(n_steps)
        x_h_full = np.zeros(n_steps)
        y_ah_full = np.zeros(n_steps)
        
        # Stockage des résultats
        results = {
            't': [],
            'torsion': {'theta_m': [], 'theta_a': [], 'theta_h': [],
                       'dtheta_m': [], 'dtheta_a': [], 'dtheta_h': []},
            'axial': {'x_ma': [], 'x_h': [],
                     'dx_ma': [], 'dx_h': []},
            'lateral': {'y_m': [], 'y_ah': [],
                       'dy_m': [], 'dy_ah': []},
            'frequences': {},
            'proprietes_arbre': {k: float(v) for k, v in props.items()}
        }
        
        # Simulation
        for i in range(n_steps):
            # Torsion
            state_torsion = self.rk4_step(
                self.equations_mouvement_torsion, 
                state_torsion, t[i], p['dt'], props
            )
            # Axial
            state_axial = self.rk4_step(
                self.equations_mouvement_axial,
                state_axial, t[i], p['dt'], props
            )
            # Lateral
            state_lateral = self.rk4_step(
                self.equations_mouvement_lateral,
                state_lateral, t[i], p['dt'], props
            )
            
            # Enregistrer les données complètes pour la FFT
            theta_h_full[i] = state_torsion[4]
            x_h_full[i] = state_axial[2]
            y_ah_full[i] = state_lateral[2]
            
            # Stockage (tous les 10 pas pour économiser la mémoire et fluidifier l'affichage)
            if i % 10 == 0:
                results['t'].append(float(t[i]))
                results['torsion']['theta_m'].append(float(state_torsion[0]))
                results['torsion']['theta_a'].append(float(state_torsion[2]))
                results['torsion']['theta_h'].append(float(state_torsion[4]))
                results['torsion']['dtheta_m'].append(float(state_torsion[1]))
                results['torsion']['dtheta_a'].append(float(state_torsion[3]))
                results['torsion']['dtheta_h'].append(float(state_torsion[5]))
                
                results['axial']['x_ma'].append(float(state_axial[0]))
                results['axial']['x_h'].append(float(state_axial[2]))
                results['axial']['dx_ma'].append(float(state_axial[1]))
                results['axial']['dx_h'].append(float(state_axial[3]))
                
                results['lateral']['y_m'].append(float(state_lateral[0]))
                results['lateral']['y_ah'].append(float(state_lateral[2]))
                results['lateral']['dy_m'].append(float(state_lateral[1]))
                results['lateral']['dy_ah'].append(float(state_lateral[3]))
        
        # Fréquences propres
        results['frequences'] = self.calculer_frequences_propres(props)
        
        # Calcul de la FFT de haute précision (sans aliasing, Fs = 1000 Hz)
        n = len(t)
        freqs = np.fft.fftfreq(n, d=p['dt'])
        
        # Filtrage pour n'envoyer que la bande de fréquences d'intérêt (0 - 150 Hz)
        f_max = 150.0
        mask = (freqs >= 0) & (freqs <= f_max)
        
        results['fft'] = {
            'freqs': freqs[mask].tolist(),
            'torsion': (np.abs(np.fft.fft(theta_h_full))[mask] / n).tolist(),
            'axial': (np.abs(np.fft.fft(x_h_full))[mask] / n).tolist(),
            'lateral': (np.abs(np.fft.fft(y_ah_full))[mask] / n).tolist()
        }
        
        return results
    
    def calculer_frequences_propres(self, props):
        """Calcule les fréquences propres du système"""
        p = self.params
        
        # --- Fréquences propres torsionnelles (3 DOF) ---
        k_t = props['k_torsion']
        I_m = p['I_moteur']
        I_a = props['m_arbre'] * (p['D_arbre']/2)**2 / 3 + 1e-6
        I_h = p['I_helice']
        
        M_t = np.diag([I_m, I_a, I_h])
        K_t = np.array([
            [p['k_moteur'], -p['k_moteur'], 0],
            [-p['k_moteur'], p['k_moteur'] + k_t, -k_t],
            [0, -k_t, k_t + p['k_helice']]
        ])
        
        try:
            eigvals_t, _ = np.linalg.eig(np.linalg.inv(M_t) @ K_t)
            freq_t = np.sqrt(np.abs(eigvals_t)) / (2 * np.pi)
            freq_t = np.sort(freq_t)
        except:
            freq_t = np.array([0, 0, 0])
        
        # --- Fréquences propres axiales (2 DOF) ---
        m_ma = p['I_moteur'] * 0.5 + props['m_arbre'] + p['m_accouplement']
        m_h = p['m_helice']
        k_eff_ax = 1.0 / (1.0 / p['k_accouplement'] + 1.0 / max(props['k_axial'], 1e6))
        
        M_ax = np.diag([m_ma, m_h])
        K_ax = np.array([[k_eff_ax, -k_eff_ax], [-k_eff_ax, k_eff_ax + p['k_helice']]])
        
        try:
            eigvals_ax, _ = np.linalg.eig(np.linalg.inv(M_ax) @ K_ax)
            freq_ax = np.sqrt(np.abs(eigvals_ax)) / (2 * np.pi)
            freq_ax = np.sort(freq_ax)
        except:
            freq_ax = np.array([0, 0])
        
        # --- Fréquences propres latérales (2 DOF) ---
        m_m = p['I_moteur'] * 0.3 + 50
        m_ah = props['m_arbre'] + p['m_accouplement'] + p['m_helice']
        k_eff_lat = 1.0 / (1.0 / p['k_palier'] + 1.0 / max(props['k_flexion'], 1e3))
        
        M_lat = np.diag([m_m, m_ah])
        K_lat = np.array([[k_eff_lat, -k_eff_lat], [-k_eff_lat, k_eff_lat + p['k_helice']]])
        
        try:
            eigvals_lat, _ = np.linalg.eig(np.linalg.inv(M_lat) @ K_lat)
            freq_lat = np.sqrt(np.abs(eigvals_lat)) / (2 * np.pi)
            freq_lat = np.sort(freq_lat)
        except:
            freq_lat = np.array([0, 0])
        
        return {
            'torsion': [float(f) for f in freq_t if f > 0.1],
            'axial': [float(f) for f in freq_ax if f > 0.1 and f < 5000],
            'lateral': [float(f) for f in freq_lat if f > 0.1],
            'excitation_torsion': float(p['ordre_excitation'] * p['rpm_nominal'] / 60),
            'excitation_pales': float(p['nb_pales'] * p['rpm_nominal'] / 60),
            'excitation_rotation': float(p['rpm_nominal'] / 60)
        }
    
    def calculer_kpi(self, results):
        """Calcule les indicateurs clés de performance"""
        kpi = {}
        
        # --- TORSION ---
        theta_h = np.array(results['torsion']['theta_h'])
        dtheta_h = np.array(results['torsion']['dtheta_h'])
        
        kpi['amplitude_torsion'] = float(np.max(np.abs(theta_h)) * 180 / np.pi)  # degrés
        kpi['vitesse_torsion_max'] = float(np.max(np.abs(dtheta_h)) * 60 / (2 * np.pi))  # rpm
        kpi['contrainte_torsion_max'] = float(np.max(np.abs(dtheta_h)) * self.params['G_acier'] * 
                                               np.pi * self.params['D_arbre']**3 / 16 / 1e6)  # MPa
        
        # --- AXIAL ---
        x_ma = np.array(results['axial']['x_ma'])
        x_h = np.array(results['axial']['x_h'])
        dx_h = np.array(results['axial']['dx_h'])
        
        kpi['amplitude_axiale'] = float(np.max(np.abs(x_h)) * 1000)  # mm
        kpi['vitesse_axiale_max'] = float(np.max(np.abs(dx_h)) * 1000)  # mm/s
        kpi['force_axiale_max'] = float(np.max(np.abs(dx_h)) * self.params['c_helice'])  # N
        
        # --- LATERAL ---
        y_m = np.array(results['lateral']['y_m'])
        y_ah = np.array(results['lateral']['y_ah'])
        dy_ah = np.array(results['lateral']['dy_ah'])
        
        kpi['amplitude_laterale'] = float(np.max(np.abs(y_ah)) * 1000)  # mm
        kpi['vitesse_laterale_max'] = float(np.max(np.abs(dy_ah)) * 1000)  # mm/s
        kpi['contrainte_flexion_max'] = float(np.max(np.abs(y_ah)) * self.params['E_acier'] * 
                                               self.params['D_arbre'] / 2 / (self.params['L_arbre']**2) / 1e6)  # MPa
        
        # --- GLOBAL ---
        kpi['vibration_totale_rms'] = float(np.sqrt(np.mean(theta_h**2) + np.mean(x_h**2) + np.mean(y_ah**2)) * 1000)  # mm eq
        kpi['niveau_vibration'] = self.classifier_niveau_vibration(kpi)
        kpi['marge_excitation_torsion'] = self.calculer_marge_excitation(results['frequences'], 'torsion')
        kpi['marge_excitation_axiale'] = self.calculer_marge_excitation(results['frequences'], 'axial')
        kpi['marge_excitation_laterale'] = self.calculer_marge_excitation(results['frequences'], 'lateral')
        
        return kpi
    
    def classifier_niveau_vibration(self, kpi):
        """Classifie le niveau de vibration selon les normes ISO"""
        vib_tot = kpi['vibration_totale_rms']
        
        if vib_tot < 0.5:
            return {"niveau": "EXCELLENT", "classe": "A", "couleur": "#10b981"}
        elif vib_tot < 1.5:
            return {"niveau": "BON", "classe": "B", "couleur": "#22c55e"}
        elif vib_tot < 4.0:
            return {"niveau": "ACCEPTABLE", "classe": "C", "couleur": "#f59e0b"}
        elif vib_tot < 10.0:
            return {"niveau": "ALARME", "classe": "D", "couleur": "#ef4444"}
        else:
            return {"niveau": "DANGER", "classe": "E", "couleur": "#dc2626"}
    
    def calculer_marge_excitation(self, frequences, mode):
        """Calcule la marge entre fréquences propres et fréquences d'excitation"""
        fp = frequences[mode]
        if mode == 'torsion':
            fe = frequences['excitation_torsion']
        elif mode == 'axial':
            fe = frequences['excitation_pales']
        elif mode == 'lateral':
            fe = frequences['excitation_rotation']
        else:
            fe = frequences['excitation_pales']
        
        if len(fp) > 0 and fe > 0:
            marge = min([abs(f - fe) / fe * 100 for f in fp])
            return float(marge)
        return 0.0
    
    def optimiser_transmission(self, objectif='min_vibration'):
        """
        Optimise les paramètres de la transmission pour minimiser les vibrations.
        
        Variables d'optimisation :
        - Diamètre de l'arbre
        - Longueur de l'arbre
        - Raideur de l'accouplement
        
        Objectifs possibles :
        - min_vibration : minimiser les vibrations globales
        - max_marge : maximiser la marge avec les fréquences d'excitation
        - min_poids : minimiser le poids tout en respectant les contraintes
        """
        p_orig = self.params.copy()
        
        def objectif_function(x):
            """Fonction objectif à minimiser"""
            D_arbre, L_arbre, k_acc = x
            
            # Contraintes physiques
            if D_arbre < 0.05 or D_arbre > 0.5:
                return 1e10
            if L_arbre < 1.0 or L_arbre > 10.0:
                return 1e10
            if k_acc < 10000 or k_acc > 1000000:
                return 1e10
            
            self.params['D_arbre'] = D_arbre
            self.params['L_arbre'] = L_arbre
            self.params['k_accouplement'] = k_acc
            
            try:
                results = self.simuler()
                kpi = self.calculer_kpi(results)
                
                if objectif == 'min_vibration':
                    return kpi['vibration_totale_rms']
                elif objectif == 'max_marge':
                    return -kpi['marge_excitation_torsion']
                elif objectif == 'min_poids':
                    props = self.calculer_proprietes_arbre()
                    poids = props['m_arbre'] + self.params['m_helice']
                    # Pénalité si vibrations trop élevées
                    penalty = max(0, kpi['vibration_totale_rms'] - 2.0) * 1000
                    return poids + penalty
                else:
                    return kpi['vibration_totale_rms']
            except:
                return 1e10
        
        # Optimisation avec scipy
        x0 = [p_orig['D_arbre'], p_orig['L_arbre'], p_orig['k_accouplement']]
        bounds = [(0.05, 0.5), (1.0, 10.0), (10000, 1000000)]
        
        try:
            result = minimize(
                objectif_function, 
                x0, 
                method='L-BFGS-B',
                bounds=bounds,
                options={'maxiter': 100, 'ftol': 1e-6}
            )
            
            D_opt, L_opt, k_opt = result.x
            
            # Résultats optimaux
            self.params['D_arbre'] = D_opt
            self.params['L_arbre'] = L_opt
            self.params['k_accouplement'] = k_opt
            
            results_opt = self.simuler()
            kpi_opt = self.calculer_kpi(results_opt)
            
            # Restaurer les paramètres originaux
            self.params = p_orig
            
            return {
                'succes': result.success,
                'parametres_optimaux': {
                    'D_arbre': float(D_opt),
                    'L_arbre': float(L_opt),
                    'k_accouplement': float(k_opt)
                },
                'kpi_optimaux': kpi_opt,
                'valeur_objectif': float(result.fun),
                'iterations': int(result.nit)
            }
        except Exception as e:
            self.params = p_orig
            return {'succes': False, 'erreur': str(e)}


# Instance globale du modèle
model = TransmissionNavaleModel()


@app.route('/')
def index():
    """Page principale"""
    return render_template('index.html')


@app.route('/api/parametres', methods=['GET'])
def get_parametres():
    """Récupère les paramètres actuels du modèle"""
    return jsonify(model.params)


@app.route('/api/simuler', methods=['POST'])
def simuler():
    """Lance une simulation avec les paramètres fournis"""
    try:
        data = request.get_json()
        custom_params = data.get('parametres', {})
        
        # Convertir les paramètres en float
        for key, val in custom_params.items():
            if key in model.params:
                model.params[key] = float(val)
        
        results = model.simuler()
        kpi = model.calculer_kpi(results)
        
        # Sous-échantillonner pour le frontend (max 1000 points)
        facteur = max(1, len(results['t']) // 1000)
        for key in ['torsion', 'axial', 'lateral']:
            for subkey in results[key]:
                results[key][subkey] = results[key][subkey][::facteur]
        results['t'] = results['t'][::facteur]
        
        return jsonify({
            'succes': True,
            'resultats': results,
            'kpi': kpi
        })
    except Exception as e:
        return jsonify({'succes': False, 'erreur': str(e)}), 500


@app.route('/api/optimiser', methods=['POST'])
def optimiser():
    """Lance l'optimisation des paramètres"""
    try:
        data = request.get_json()
        objectif = data.get('objectif', 'min_vibration')
        
        resultat_optim = model.optimiser_transmission(objectif)
        
        return jsonify({
            'succes': True,
            'optimisation': resultat_optim
        })
    except Exception as e:
        return jsonify({'succes': False, 'erreur': str(e)}), 500


@app.route('/api/frequences', methods=['GET'])
def get_frequences():
    """Calcule et retourne les fréquences propres"""
    try:
        props = model.calculer_proprietes_arbre()
        frequences = model.calculer_frequences_propres(props)
        
        return jsonify({
            'succes': True,
            'frequences': frequences,
            'proprietes_arbre': {k: float(v) for k, v in props.items()}
        })
    except Exception as e:
        return jsonify({'succes': False, 'erreur': str(e)}), 500


@app.route('/api/reset', methods=['POST'])
def reset():
    """Réinitialise les paramètres par défaut"""
    global model
    model = TransmissionNavaleModel()
    return jsonify({'succes': True, 'parametres': model.params})


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
