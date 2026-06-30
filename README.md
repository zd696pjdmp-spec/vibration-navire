# VibrationNav - MVP

## Modélisation, Simulation et Optimisation des Vibrations
### Système de Transmission de Puissance Navale

---

## Structure Visuelle

L'interface s'inspire du design de [SolarTwin-Yaoundé AI](https://ltef4ugltirpy.ok.kimi.link/) avec :
- **Header** : Logo, titre, badges techniques (RK4 Solver, Analyse Vibratoire, Optimisation)
- **Onglets** : Simulation | Animation | Analyse
- **Section Paramètres** : 9 sliders pour ajuster les paramètres du système
- **Cartes KPI** : 4 indicateurs de performance (Amplitude Torsion, Axiale, Latérale, Niveau)
- **Graphiques** : 4 charts Chart.js (Torsion, Axiale, Latérale, FFT)
- **Footer** : Informations projet

---

## Modèle Physique

Le système modélisé : **Moteur → Accouplement → Arbre → Hélice**

### Types de Vibrations
1. **Vibrations de Torsion** (3 DOF) : Rotation du moteur, arbre et hélice
2. **Vibrations Axiales** (2 DOF) : Déplacements longitudinaux
3. **Vibrations Latérales** (2 DOF) : Déplacements transversaux (flèche)

### Méthode Numérique
- **Runge-Kutta d'ordre 4 (RK4)** pour l'intégration temporelle
- Pas de temps : 1 ms
- Durée de simulation : 10 secondes

### Sources d'Excitation
- Couple moteur pulsatoire (ordre d'excitation)
- Efforts hélice (fréquence de passage de pales)
- Déséquilibre rotatif

---

## Paramètres Ajustables

| Paramètre | Plage | Description |
|-----------|-------|-------------|
| Inertie Moteur | 0.5 - 10 kg.m² | Moment d'inertie du moteur |
| Régime Moteur | 200 - 3000 tr/min | Vitesse de rotation |
| Ordre Excitation | 1 - 12 | Ordre harmonique moteur |
| Longueur Arbre | 1 - 10 m | Longueur de l'arbre |
| Diamètre Arbre | 50 - 500 mm | Diamètre de l'arbre |
| Amortissement Arbre | 10 - 500 N.s/m | Amortissement structurel |
| Masse Hélice | 10 - 200 kg | Masse de l'hélice |
| Nombre de Pales | 2 - 8 | Nombre de pales d'hélice |
| Amplitude Excitation | 10 - 200 N | Amplitude des forces |

---

## Fonctionnalités

### Simulation
- Ajustement des paramètres en temps réel via sliders
- Calcul RK4 des vibrations sur 10 secondes
- Affichage des KPI et graphiques temps/fréquence

### Animation
- Visualisation temps réel de la ligne d'arbre
- Animation du moteur, arbre et hélice avec déplacements
- Boutons Lancer/Pause

### Analyse
- Fréquences propres des 3 modes (torsion, axial, latéral)
- Fréquences d'excitation (moteur + pales)
- Propriétés mécaniques de l'arbre
- Carte de chaleur des vibrations

### Optimisation
- Optimisation automatique des paramètres (diamètre, longueur, raideur)
- Objectif : minimiser les vibrations globales
- Algorithme L-BFGS-B (scipy)

---

## Installation

### Prérequis
- Python 3.9+
- pip

### Dépendances
```bash
pip install -r requirements.txt
```

### Lancement
```bash
python run.py
```

L'application sera accessible sur : `http://localhost:5000`

---

## Architecture

```
vibration-navire/
├── app.py                  # Backend Flask + Modèle physique
├── run.py                  # Point d'entrée
├── requirements.txt        # Dépendances Python
├── README.md              # Ce fichier
├── static/
│   ├── css/
│   │   └── style.css      # Styles (design inspiré)
│   └── js/
│       └── app.js         # Frontend interactif
└── templates/
    └── index.html         # Interface utilisateur
```

---

## Technologies

- **Backend** : Python, Flask, NumPy, SciPy
- **Frontend** : HTML5, CSS3, JavaScript vanilla
- **Graphiques** : Chart.js 4.4
- **Modèle physique** : Équations différentielles couplées, RK4
- **Optimisation** : scipy.optimize.minimize (L-BFGS-B)

---

## Notes Techniques

- Le modèle utilise des équations à 2-3 degrés de liberté couplés
- Les fréquences propres sont calculées par résolution du problème aux valeurs propres
- L'optimisation ajuste le diamètre, la longueur et la raideur d'accouplement
- Pas d'IA prédictive ni de contrôle PID (conformément au cahier des charges)
