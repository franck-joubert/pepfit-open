#!/usr/bin/env python3
"""Fabrique les sons des notifications d'alarme sur iPhone (docs/CODE-IOS-RAPPELS.md) dans assets/sons.

iOS ne joue que des sons du bundle de l'appli (PCM linéaire, aiff, caf ou wav), et au plus 30 s ; au-delà, le son par défaut
le remplace. Copiés dans l'appli iOS par plugins/ios-rappels.js. Sons synthétisés ici (aucun fichier de tiers, aucun droit) :
  - pepfit-repos.wav : fin du repos, deux notes brèves (1,2 s) ;
  - pepfit-reveil.wav : fin de sieste, trois notes montantes répétées, de plus en plus fort pendant 8 s (28 s en tout) ;
  - pepfit-silence.wav : 0,5 s de silence, pour une notification qui vibre sans sonner (« vibration » seule).
Usage : python3 scripts/sons-ios.py   (réécrit les trois fichiers ; même résultat à chaque fois)
"""
import math, os, struct, wave

TAUX = 16000
DOSSIER = os.path.join(os.path.dirname(__file__), "..", "assets", "sons")


def note(freq, duree, volume):
    """Une note douce : attaque de 10 ms, décroissance exponentielle, une harmonique légère."""
    n = int(duree * TAUX)
    return [
        volume * min(1.0, i / (0.01 * TAUX)) * math.exp(-4.0 * i / n)
        * (math.sin(2 * math.pi * freq * i / TAUX) + 0.25 * math.sin(4 * math.pi * freq * i / TAUX)) / 1.25
        for i in range(n)
    ]


def silence(duree):
    return [0.0] * int(duree * TAUX)


def ecrire(nom, echantillons):
    with wave.open(os.path.join(DOSSIER, nom), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TAUX)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, x)) * 32000)) for x in echantillons))


def repos():
    return note(880, 0.35, 0.7) + note(1318.5, 0.85, 0.7)


def reveil():
    motif = note(659.3, 0.22, 1) + note(880, 0.22, 1) + note(1108.7, 0.5, 1) + silence(0.66)  # 1,6 s
    sons = []
    while len(sons) + len(motif) <= 28 * TAUX:
        sons += motif
    sons += [0.0] * (28 * TAUX - len(sons))
    montee = 8 * TAUX
    return [x * (0.3 + 0.6 * min(1.0, i / montee)) for i, x in enumerate(sons)]


if __name__ == "__main__":
    os.makedirs(DOSSIER, exist_ok=True)
    ecrire("pepfit-repos.wav", repos())
    ecrire("pepfit-reveil.wav", reveil())
    ecrire("pepfit-silence.wav", silence(0.5))
