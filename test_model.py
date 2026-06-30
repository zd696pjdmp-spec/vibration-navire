# Script de test pour le modèle de vibration
import numpy as np
from app import TransmissionNavaleModel

print("Initialisation du modèle...")
model = TransmissionNavaleModel()

print("Lancement de la simulation...")
res = model.simuler()

print("Simulation terminée avec succès !")
print("Longueur du vecteur temps :", len(res['t']))
print("Échantillon de torsion (theta_h) :", res['torsion']['theta_h'][:5])
print("Échantillon d'axial (x_h) :", res['axial']['x_h'][:5])
print("Échantillon de latéral (y_ah) :", res['lateral']['y_ah'][:5])

kpi = model.calculer_kpi(res)
print("\nKPI calculés :")
for k, v in kpi.items():
    print(f"  {k} : {v}")
