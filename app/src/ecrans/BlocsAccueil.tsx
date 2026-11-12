import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import type { SQLiteDatabase } from "expo-sqlite";
import { sante } from "../natif/sante";
import { useTheme } from "../theme";
import { espace, police, rayon } from "../theme/typo";
import { BoutonTonal } from "../ui/BoutonTonal";
import { BoutonPrincipal } from "../ui/Degrade";
import { Icone } from "../ui/Icone";
import { Texte } from "../ui/Texte";
import { t, tp, type CleSimple } from "../i18n/index";
import { defBloc, demarrerASuivreTonal, type Bloc, type IdBloc } from "./accueil-blocs";
import { actionMesure, ContenuMesure, type IdCarteAccueil } from "./mesures/Cartes";
import { OBJECTIF_PAS, type DonneesAccueil } from "./accueil-donnees";
import { ouvrirRecap } from "./recap/ouvrir-recap";
import { valeurRecord } from "./fin-seance-vue";
import { texteQuand } from "./Planif";
import { jourDe } from "./planif-donnees";
import { approx, dateSeance, debutJour, dureeCourte, heureTexte, ilYa, jourCourt, jourDuMois, jourMois, nombre, plage, ajouterJours, serieTexte, versUnite, type Unite } from "./format";

// Contenu des blocs de l'accueil (planche B · Mosaïque) : en-tête (icône de la partie à plat, libellé, méta), une valeur
// ou un titre, un sous-titre, puis une visualisation ou une liste. Un seul dégradé : Démarrer. Le cadre (carte, mode
// Modifier) est dans app/index.tsx.

export const LIBELLES: Record<IdBloc, CleSimple> = {
  "a-suivre": "accueil.blocs.aSuivre",
  seances: "accueil.blocs.seances",
  whoop: "accueil.blocs.whoop",
  pas: "accueil.blocs.pas",
  semaine: "accueil.blocs.semaine",
  derniere: "accueil.blocs.derniere",
  records: "accueil.blocs.records",
  poids: "accueil.blocs.poids",
  regularite: "accueil.blocs.regularite",
  nutrition: "accueil.blocs.nutrition",
  sommeil: "accueil.blocs.sommeil",
  energie: "cartes.bloc.energie",
  recup: "accueil.blocs.recuperation",
  effort: "accueil.blocs.effort",
  age: "cartes.bloc.age",
  vo2max: "vo2.court",
};

export const libelleBloc = (id: IdBloc) => t(LIBELLES[id]);

type Props = {
  bloc: Bloc;
  d: DonneesAccueil;
  db: SQLiteDatabase;
  u: Unite;
  /** Faux en mode Modifier et dans les aperçus : rien ne réagit au toucher. */
  interactif: boolean;
  /** Mode Modifier : le bouton passe à demi-opacité. */
  edition?: boolean;
  onPoids?: () => void;
};

/**
 * Demande la lecture des pas ; refusée (ou plus proposée par Android) et `reglagesSiRefus`, ouvre Santé Connect.
 * Vrai si c'est accordé tout de suite. Sans Santé Connect, rien ne s'ouvre.
 */
export async function autoriserPas(reglagesSiRefus: boolean): Promise<boolean> {
  if (await sante.demanderPermissions(["pas"])) return true;
  if (reglagesSiRefus) await sante.ouvrirReglages();
  return false;
}

/** Le toucher du bloc entier, ou null s'il n'ouvre rien. Les cartes de mesure ouvrent leur page (planche pas) ; la carte
 * Poids pleine n'est pas un bouton : chacune de ses deux colonnes ouvre sa page. */
export function actionBloc(id: IdBloc, d: DonneesAccueil, onPoids?: () => void, taille?: Bloc["taille"]): (() => void) | null {
  if (estCarteMesure(id)) return id === "poids" && taille === "pleine" ? null : actionMesure(id, d.cartes, d.enAttente.has(id));
  if (id === "a-suivre" && d.stats.aSuivre) {
    const routineId = d.stats.aSuivre.routineId;
    return () => ouvrirRecap({ routineId });
  }
  if (id === "derniere" && d.stats.derniereSeance) {
    const s = d.stats.derniereSeance.id;
    return () => router.push(`/history/${s}`);
  }
  if (id === "seances" && d.prochaines[0]) {
    const { programmationId, origine } = d.prochaines[0];
    return () => ouvrirRecap({ prevue: { programmationId, origine } });
  }
  if (id === "semaine" || id === "regularite") return () => router.push("/history");
  return null;
}

const CARTES_MESURE: readonly IdBloc[] = ["pas", "poids", "energie", "sommeil", "recup", "effort", "age", "vo2max"];
const estCarteMesure = (id: IdBloc): id is IdCarteAccueil => CARTES_MESURE.includes(id);

export function TeteBloc({ id, meta, serie, libelle }: { id: IdBloc; meta?: string; serie?: number; libelle?: string }) {
  const { couleurs } = useTheme();
  const def = defBloc(id);
  return (
    <View style={styles.tete}>
      <Icone nom={def.icone} couleur={couleurs[def.teinte]} taille={18} />
      <Texte numberOfLines={1} style={[styles.libelle, { color: couleurs.t2, flex: 1 }]}>
        {libelle ?? libelleBloc(id)}
      </Texte>
      {meta ? (
        <Texte variante="meta" couleur="t2" numberOfLines={1}>
          {meta}
        </Texte>
      ) : null}
      {serie ? (
        <View accessible accessibilityLabel={tp("accueil.blocs.serie", serie)} style={styles.serie}>
          <Icone nom="flamme" couleur={couleurs[def.teinte]} taille={14} />
          <Texte variante="meta" couleur="t2" style={{ fontFamily: police.medium }}>
            {nombre(serie, 0)}
          </Texte>
        </View>
      ) : null}
    </View>
  );
}

/** En mode Modifier, la ligne de contrôle remplace l'en-tête. */
function Tete({ edition, ...p }: { edition?: boolean; id: IdBloc; meta?: string; serie?: number; libelle?: string }) {
  return edition ? null : <TeteBloc {...p} />;
}

export function ContenuBloc({ bloc, d, u, interactif, edition, onPoids }: Props) {
  const { couleurs } = useTheme();
  const def = defBloc(bloc.id);
  const teinte = couleurs[def.teinte];
  const plein = bloc.taille === "pleine";
  const { semaine, aSuivre, derniereSeance } = d.stats;

  if (estCarteMesure(bloc.id)) {
    // pas encore lue (premier lancement, M9) : l'en-tête seul, la valeur arrive (pas de « aucune source » trompeur)
    if (d.enAttente.has(bloc.id)) return <Tete edition={edition} id={bloc.id} />;
    const libelle = bloc.id === "poids" && plein && d.cartes.corps?.gras ? t("cartes.bloc.poidsGras") : undefined;
    return <ContenuMesure id={bloc.id} plein={plein} d={d.cartes} interactif={interactif} tete={(meta) => <Tete edition={edition} id={bloc.id} meta={meta} libelle={libelle} />} />;
  }

  switch (bloc.id) {
    case "a-suivre":
      if (!aSuivre)
        return (
          <>
            <Tete edition={edition} id={bloc.id} />
            <Vide texte={t("accueil.blocs.aucuneRoutine")} />
            <BoutonTonal libelle={t("accueil.blocs.choisirRoutine")} hauteur={plein ? 48 : 44} style={[styles.bouton, edition && styles.estompe]} onPress={() => router.push("/routines")} />
          </>
        );
      return (
        <>
          <Tete edition={edition} id={bloc.id} />
          <Titre texte={aSuivre.nom} />
          <SousTitre
            texte={`${approx(dureeCourte(d.aSuivreDureeS ?? 0))}${plein && aSuivre.derniereFois ? `, ${ilYa(aSuivre.derniereFois)}` : ""}`}
          />
          {/* Séance en cours : le geste est « Reprendre » dans le bandeau. La séance prévue aujourd'hui a son Démarrer plein :
              celui-ci passe en tonal (un seul bouton plein, n° 20). */}
          {d.enCours ? null : demarrerASuivreTonal(d.stockes, !!d.prochaines[0]?.aujourdhui) ? (
            <BoutonTonal
              libelle={t("accueil.blocs.demarrer")}
              accessibilityLabel={t("accueil.blocs.demarrerNom", { nom: aSuivre.nom })}
              hauteur={plein ? 48 : 44}
              style={[styles.bouton, edition && styles.estompe]}
              onPress={() => ouvrirRecap({ routineId: aSuivre.routineId })}
            />
          ) : (
            <View style={edition && styles.estompe}>
              <BoutonPrincipal
                libelle={t("accueil.blocs.demarrer")}
                accessibilityLabel={t("accueil.blocs.demarrerNom", { nom: aSuivre.nom })}
                icone="play"
                onPress={() => ouvrirRecap({ routineId: aSuivre.routineId })}
                style={[styles.bouton, { height: plein ? 48 : 44 }]}
              />
            </View>
          )}
        </>
      );

    case "seances": {
      const [p, ...suite] = d.prochaines;
      if (!p)
        return (
          <>
            <Tete edition={edition} id={bloc.id} />
            <Vide texte={t("accueil.blocs.rienDePrevu")} />
            <BoutonTonal libelle={t("accueil.blocs.choisirRoutine")} hauteur={plein ? 48 : 44} style={[styles.bouton, edition && styles.estompe]} onPress={() => router.push("/routines")} />
          </>
        );
      const auj = jourDe(Date.now());
      const quandP = majuscule(texteQuand(p.date, auj));
      return (
        <>
          <Tete edition={edition} id={bloc.id} />
          <Titre texte={p.nom} />
          <SousTitre texte={plein ? `${quandP}, ${heureTexte(p.heure)}, ${approx(dureeCourte(p.dureeS))}` : `${quandP}, ${heureTexte(p.heure)}`} />
          {/* Le seul dégradé : Démarrer, quand la prochaine séance est aujourd'hui (et qu'aucune n'est en cours). */}
          {plein && p.aujourdhui && !d.enCours ? (
            <View style={edition && styles.estompe}>
              <BoutonPrincipal
                libelle={t("accueil.blocs.demarrer")}
                accessibilityLabel={t("accueil.blocs.demarrerNom", { nom: p.nom })}
                icone="play"
                onPress={() => ouvrirRecap({ routineId: p.routineId, prevue: p })}
                style={[styles.bouton, { height: 48 }]}
              />
            </View>
          ) : null}
          {plein && suite.length ? (
            <View style={styles.liste}>
              {suite.slice(0, 3).map((s) => (
                <LigneListe key={`${s.programmationId}|${s.origine}`}>
                  <Texte numberOfLines={1} style={[styles.ligneNom, { color: couleurs.t1 }]}>
                    {s.nom}
                  </Texte>
                  <Texte numberOfLines={1} style={[styles.ligneValeur, { color: couleurs.t2 }]}>
                    {`${majuscule(texteQuand(s.date, auj))}, ${heureTexte(s.heure)}`}
                  </Texte>
                </LigneListe>
              ))}
            </View>
          ) : null}
        </>
      );
    }

    case "whoop":
      return (
        <>
          <Tete edition={edition} id={bloc.id} />
          <SousTitre texte={t("accueil.blocs.nonConnecte")} />
          <BoutonTonal libelle={t("accueil.blocs.connecter")} hauteur={plein ? 48 : 44} style={[styles.bouton, edition && styles.estompe]} onPress={() => router.navigate("/health")} />
        </>
      );

    case "semaine": {
      const serie = d.serie.enCours;
      if (!plein)
        return (
          <>
            <Tete edition={edition} id={bloc.id} serie={serie} />
            <Valeur valeur={String(semaine.nbSeances)} unite={tp("accueil.blocs.seancesMot", semaine.nbSeances)} />
            {/* Séance faite : le vert « validé » (teintes-parties, D4 du 29/10), comme le semainier du Sport. */}
            <Sem7 jours={semaine.jours} couleur={couleurs.valide} />
          </>
        );
      return (
        <>
          <Tete edition={edition} id={bloc.id} meta={plage(new Date(semaine.debut), ajouterJours(semaine.debut, 6))} serie={serie} />
          <Jours jours={semaine.jours} interactif={interactif} />
          <View style={styles.mets}>
            <Mesure titre={t("accueil.index.seances")} valeur={String(semaine.nbSeances)} />
            <Mesure titre={t("accueil.index.duree")} valeur={dureeCourte(semaine.dureeMin * 60)} />
            <Mesure titre={t("accueil.index.volume")} valeur={nombre(Math.round(versUnite(semaine.volumeKg, u)), 0)} unite={u} />
          </View>
        </>
      );
    }

    case "derniere": {
      if (!derniereSeance)
        return (
          <>
            <Tete edition={edition} id={bloc.id} />
            <Vide texte={t("accueil.blocs.aucuneSeance")} />
          </>
        );
      const duree = dureeCourte(derniereSeance.dureeMin * 60);
      // Sans charge (course, padel…), pas de « 0 kg ».
      const volume = derniereSeance.volumeKg > 0 ? `, ${nombre(Math.round(versUnite(derniereSeance.volumeKg, u)), 0)} ${u}` : "";
      return (
        <>
          <Tete edition={edition} id={bloc.id} />
          <Titre texte={derniereSeance.titre} />
          <SousTitre texte={plein ? `${dateSeance(derniereSeance.debut)}, ${duree}${volume}` : `${dateSeance(derniereSeance.debut)}, ${duree}`} />
          {/* Jours de repos (27/10) : masqués si une séance a eu lieu aujourd'hui. */}
          {d.repos ? (
            <Texte variante="corps" couleur="t2" numberOfLines={1} style={{ marginTop: 2 }}>
              {tp("accueil.blocs.repos", d.repos)}
            </Texte>
          ) : null}
          {plein && derniereSeance.meilleuresSeries.length ? (
            <View style={styles.liste}>
              {derniereSeance.meilleuresSeries.slice(0, 3).map((m) => (
                <LigneListe key={m.exerciceId}>
                  <Texte numberOfLines={1} style={[styles.ligneNom, { color: couleurs.t1 }]}>
                    {m.nom}
                  </Texte>
                  {d.recordsDerniere.some((r) => r.exerciceId === m.exerciceId) ? <Icone nom="medal" couleur={couleurs.record} taille={18} /> : null}
                  <Texte style={[styles.ligneValeur, { color: couleurs.t1 }]}>{serieTexte(m.kg, m.reps, u)}</Texte>
                </LigneListe>
              ))}
            </View>
          ) : null}
        </>
      );
    }

    case "records": {
      const premier = d.recents[0];
      if (!premier)
        return (
          <>
            <Tete edition={edition} id={bloc.id} />
            <Vide texte={t("accueil.blocs.aucunRecord")} />
          </>
        );
      if (!plein) {
        const v = valeurRecord(premier.type, premier.valeur, u);
        return (
          <>
            <Tete edition={edition} id={bloc.id} />
            <Valeur valeur={v.valeur} unite={v.unite || undefined} />
            {/* Nom de l'exercice sur deux lignes : « Élévation latérale (Haltères) » n'est plus coupé (revue finale n° 29). */}
            <SousTitre texte={premier.nom} lignes={2} />
          </>
        );
      }
      return (
        <>
          <Tete edition={edition} id={bloc.id} />
          <View style={styles.liste}>
            {d.recents.map((r) => {
              const v = valeurRecord(r.type, r.valeur, u);
              return (
                <LigneListe
                  key={`${r.seance_id}|${r.exercice_id}`}
                  onPress={interactif ? () => router.push({ pathname: "/progress/[id]", params: { id: r.exercice_id } }) : undefined}
                >
                  <Icone nom="medal" couleur={couleurs.record} taille={18} />
                  <View style={{ flex: 1 }}>
                    <Texte numberOfLines={2} style={[styles.ligneNom, { flex: 0, color: couleurs.t1 }]}>
                      {r.nom}
                    </Texte>
                    <Texte variante="meta" couleur="t2">
                      {jourMois(r.atteint_le)}
                    </Texte>
                  </View>
                  <Texte style={[styles.ligneValeur, { color: couleurs.t1 }]}>{`${v.valeur}${v.unite ? ` ${v.unite}` : ""}`}</Texte>
                </LigneListe>
              );
            })}
          </View>
        </>
      );
    }

    case "regularite":
      return (
        <>
          <Tete edition={edition} id={bloc.id} />
          <Valeur valeur={nombre(d.serie.enCours, 0)} unite={tp("accueil.blocs.semainesMot", d.serie.enCours)} />
          <SousTitre texte={t("accueil.blocs.daffilee")} />
          <Barres valeurs={d.semaines} couleur={teinte} hauteur={plein ? 52 : 40} />
        </>
      );

    case "nutrition":
      return (
        <>
          <Tete edition={edition} id={bloc.id} />
          <Texte variante="meta" couleur="t2" style={{ marginTop: 6 }}>
            {t("accueil.blocs.bientot")}
          </Texte>
        </>
      );
  }
}

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Titre({ texte }: { texte: string }) {
  return (
    <Texte numberOfLines={1} style={styles.titre}>
      {texte}
    </Texte>
  );
}

function SousTitre({ texte, lignes = 1 }: { texte: string; lignes?: number }) {
  return (
    <Texte variante="corps" couleur="t2" numberOfLines={lignes} style={{ marginTop: 2 }}>
      {texte}
    </Texte>
  );
}

function Vide({ texte }: { texte: string }) {
  return (
    <Texte variante="corps" couleur="t2" numberOfLines={1} style={{ fontSize: 15, marginTop: 6 }}>
      {texte}
    </Texte>
  );
}

function Valeur({ valeur, unite }: { valeur: string; unite?: string }) {
  const { couleurs } = useTheme();
  return (
    <Texte numberOfLines={1} style={styles.valeur}>
      <Texte style={[styles.nombre, { color: couleurs.t1 }]}>{valeur}</Texte>
      {unite ? <Texte style={[styles.unite, { color: couleurs.t2 }]}>{` ${unite}`}</Texte> : null}
    </Texte>
  );
}

function LigneListe({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const { couleurs, mode } = useTheme();
  const filet = { borderTopColor: mode === "nuit" ? couleurs.s3 : couleurs.line2 };
  if (!onPress) return <View style={[styles.ligne, filet]}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.ligne, filet, pressed && { opacity: 0.6 }]}>
      {children}
    </Pressable>
  );
}

function Mesure({ titre, valeur, unite }: { titre: string; valeur: string; unite?: string }) {
  const { couleurs } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Texte variante="meta" couleur="t2" style={{ marginBottom: 3 }}>
        {titre}
      </Texte>
      <Texte numberOfLines={1} style={{ fontFamily: police.medium, fontSize: 16, color: couleurs.t1 }}>
        {valeur}
        {unite ? <Texte variante="corps" couleur="t2">{` ${unite}`}</Texte> : null}
      </Texte>
    </View>
  );
}

function Barres({ valeurs, couleur, hauteur }: { valeurs: number[]; couleur: string; hauteur: number }) {
  const max = Math.max(1, ...valeurs);
  return (
    <View style={[styles.barres, { height: hauteur }]}>
      {valeurs.map((v, k) => (
        <View
          key={k}
          style={{ flex: 1, height: Math.max(3, (v / max) * hauteur), backgroundColor: couleur, opacity: k === valeurs.length - 1 ? 1 : 0.32, borderTopLeftRadius: 2, borderTopRightRadius: 2 }}
        />
      ))}
    </View>
  );
}

type Jour = DonneesAccueil["stats"]["semaine"]["jours"][number];

/** Sept carrés (demie) : faits pleins, aujourd'hui en gras. */
function Sem7({ jours, couleur }: { jours: Jour[]; couleur: string }) {
  const { couleurs } = useTheme();
  const auj = debutJour(Date.now()).getTime();
  return (
    <View style={styles.sem7}>
      {jours.map((j) => {
        const ici = debutJour(j.date).getTime() === auj;
        return (
          <View key={j.date} style={styles.sem7Jour}>
            <Texte variante="meta" couleur={ici ? "t1" : "t2"} style={[{ fontSize: 11 }, ici && { fontFamily: police.semibold }]}>
              {jourCourt(j.date).slice(0, 1).toUpperCase()}
            </Texte>
            <View style={[styles.carre, { backgroundColor: j.fait ? couleur : couleurs.s3 }]} />
          </View>
        );
      })}
    </View>
  );
}

/** Sept ronds (pleine) : jour fait bordé de l'orange du Sport (D1), aujourd'hui sur s2 ; toucher un jour fait ouvre sa séance. */
function Jours({ jours, interactif }: { jours: Jour[]; interactif: boolean }) {
  const { couleurs } = useTheme();
  const auj = debutJour(Date.now()).getTime();
  return (
    <View style={styles.jours}>
      {jours.map((j) => {
        const ici = debutJour(j.date).getTime() === auj;
        const premiere = j.seances[0];
        return (
          <Pressable
            key={j.date}
            disabled={!premiere || !interactif}
            accessibilityRole={premiere ? "button" : undefined}
            accessibilityLabel={`${jourCourt(j.date)} ${jourDuMois(j.date)}${premiere ? `, ${premiere.titre}` : ""}`}
            onPress={() => premiere && router.push(`/history/${premiere.id}`)}
            hitSlop={ELARGIR_JOUR}
            style={styles.jour}
          >
            <Texte variante="meta" couleur={ici ? "t1" : "t2"} style={ici ? { fontFamily: police.semibold } : undefined}>
              {jourCourt(j.date).slice(0, 1).toUpperCase()}
            </Texte>
            {/* Séance faite : le vert « validé » (teintes-parties, D4 du 29/10). La bordure est toujours là, transparente
                sinon : ajoutée après coup sur un rond sans fond, Android la dessinait carrée (jeudi 29, le 30/10). */}
            <View style={[styles.rond, ici && { backgroundColor: couleurs.s2 }, { borderColor: j.fait ? couleurs.valide : "transparent" }]}>
              <Texte style={{ fontFamily: police.regular, fontSize: 15, color: j.fait ? couleurs.valide : couleurs.t1 }}>{jourDuMois(j.date)}</Texte>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Jours de la mini-semaine : 40 de large (sept dans la carte), 44 au toucher (revue finale n° 48). */
const ELARGIR_JOUR = { left: 2, right: 2 };

const styles = StyleSheet.create({
  tete: { flexDirection: "row", alignItems: "center", gap: espace.s, minHeight: 18 },
  libelle: { fontFamily: police.medium, fontSize: 13 },
  serie: { flexDirection: "row", alignItems: "center", gap: 3 },
  titre: { fontFamily: police.semibold, fontSize: 17, marginTop: 10 },
  valeur: { marginTop: 10 },
  nombre: { fontFamily: police.medium, fontSize: 24, fontVariant: ["tabular-nums"] },
  unite: { fontFamily: police.regular, fontSize: 14 },
  bouton: { marginTop: espace.m, borderRadius: rayon.l },
  estompe: { opacity: 0.5 },
  liste: { marginTop: espace.m },
  ligne: { flexDirection: "row", alignItems: "center", gap: espace.m, minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth },
  ligneNom: { flex: 1, fontFamily: police.regular, fontSize: 15 },
  ligneValeur: { fontFamily: police.medium, fontSize: 15 },
  mets: { flexDirection: "row", marginTop: espace.m },
  barres: { flexDirection: "row", alignItems: "flex-end", gap: 5, marginTop: espace.m },
  sem7: { flexDirection: "row", gap: 5, marginTop: espace.m },
  sem7Jour: { flex: 1, alignItems: "center", gap: 6 },
  carre: { width: 12, height: 12, borderRadius: 4 },
  jours: { flexDirection: "row", justifyContent: "space-between", marginTop: espace.m },
  jour: { width: 40, alignItems: "center", gap: 6, minHeight: 44 },
  rond: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
