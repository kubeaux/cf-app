// La Truculance — serveur (Google Apps Script, à coller dans le script lié au Google Sheet).
//
// Réglages à créer dans « Paramètres du projet » > « Propriétés du script » (jamais dans ce fichier) :
//   CODE_CLASSE : le code que tapent les élèves
//   CODE_ADMIN  : ton code à toi pour la page admin (long, différent du code de la classe)
//   MODE_AUTO   : « oui » = les propositions sont publiées sans validation (se règle depuis la page admin)
// Les réglages de l'échéance (PASSAGES_SHEET_ID, PASSAGES_PROF, PASSAGES_ALIAS) se font depuis la page admin.
//
// Déploiement : Déployer > Gérer les déploiements > crayon > Version : « Nouvelle version » > Déployer.
// L'adresse /exec ne change pas, donc config.js non plus.

const PDF_MAX = 5 * 1024 * 1024;
const PDF_MAX_LECTURE = 25 * 1024 * 1024;
const NOM_DOSSIER_PDF = "La Truculance — PDF";

// Mêmes listes que dans config.js : le serveur refuse une valeur inconnue.
const LISTES = {
  format: ["Pièce de théâtre", "Film", "Série", "Autre"],
  echeance: ["Échéance 1", "Échéance 2", "Échéance 3", "Échéance 4"],
  type: ["Monologue", "Duo", "Scène collective"],
  siecle: ["XVIe", "XVIIe", "XVIIIe", "XIXe", "XXe", "XXIe"],
  registre: ["Comique", "Dramatique", "Autre"]
};

// [champ, titre de la colonne]. Les 12 premières sont envoyées aux élèves ; ID et Date restent côté serveur.
const COLONNES = [
  ["format", "Format"], ["titre", "Titre"], ["auteur", "Auteur"], ["personnages", "Personnages"],
  ["echeance", "Échéance"], ["type", "Type"], ["siecle", "Siècle"], ["registre", "Registre"],
  ["duree", "Durée"], ["lien", "Lien du texte"], ["prenom", "Prénom"], ["valide", "Validé"],
  ["id", "ID"], ["date", "Date"]
];
const COLONNES_PUBLIQUES = 12;

/* ---------- Entrées ---------- */

function doGet() {
  return reponse_({ ok: false, erreur: "Accès réservé." });
}

function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
    if (!d || typeof d !== "object") throw new Error("corps invalide");
  } catch (err) {
    return reponse_({ ok: false, erreur: "Requête illisible." });
  }

  try {
    switch (d.action || "proposer") {
      case "lire": return reponse_(lire_(d));
      case "pdf": return reponse_(pdf_(d));
      case "proposer": return reponse_(proposer_(d));
      case "mes": return reponse_(mes_(d));
      case "passages": return reponse_(passages_(d));
      case "admin_liste": return reponse_(adminListe_(d));
      case "admin_decision": return reponse_(adminDecision_(d));
      case "admin_mode": return reponse_(adminMode_(d));
      case "admin_modifier": return reponse_(adminModifier_(d));
      case "admin_passages": return reponse_(adminPassages_(d));
      case "admin_passages_sheet": return reponse_(adminPassagesSheet_(d));
      case "admin_passages_prof": return reponse_(adminPassagesProf_(d));
      case "admin_passages_alias": return reponse_(adminPassagesAlias_(d));
      default: return reponse_({ ok: false, erreur: "Action inconnue." });
    }
  } catch (err) {
    console.error(err && err.stack || err);
    return reponse_({ ok: false, erreur: "Erreur du serveur. Réessaie plus tard." });
  }
}

/* ---------- Codes ---------- */

const refus_ = { ok: false, code: true, erreur: "Code incorrect." };

function egal_(a, b) {
  a = String(a || ""); b = String(b || "");
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
const prop_ = (nom) => PropertiesService.getScriptProperties().getProperty(nom) || "";
const estAdmin_ = (code) => egal_(String(code || "").trim(), prop_("CODE_ADMIN").trim());
const estClasse_ = (code) => estAdmin_(code) || egal_(String(code || "").trim().toLowerCase(), prop_("CODE_CLASSE").trim().toLowerCase());
const modeAuto_ = () => prop_("MODE_AUTO").toLowerCase() === "oui";

/* ---------- Feuille ---------- */

const norm_ = (s) => String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const texte_ = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

function reponse_(objet) {
  return ContentService.createTextOutput(JSON.stringify(objet)).setMimeType(ContentService.MimeType.JSON);
}

// Ouvre la feuille et crée les colonnes qui manquent. Renvoie { feuille, col } (col : champ -> numéro de colonne, à partir de 1).
function ouvrir_() {
  const feuille = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const nbCol = Math.max(feuille.getLastColumn(), 1);
  const entetes = feuille.getRange(1, 1, 1, nbCol).getValues()[0].map(norm_);
  const col = {};
  let suivante = entetes.reduce((dernier, h, i) => (h ? i + 1 : dernier), 0) + 1;
  for (const [champ, titre] of COLONNES) {
    const i = entetes.indexOf(norm_(titre));
    if (i >= 0) {
      col[champ] = i + 1;
    } else {
      if (suivante > feuille.getMaxColumns()) feuille.insertColumnsAfter(feuille.getMaxColumns(), suivante - feuille.getMaxColumns());
      feuille.getRange(1, suivante).setValue(titre);
      col[champ] = suivante++;
    }
  }
  return { feuille, col };
}

// Toutes les lignes de données, sous forme d'objets { champ: valeur, ligne: numéro dans la feuille }.
function lignes_(t) {
  const n = t.feuille.getLastRow() - 1;
  if (n < 1) return [];
  const nbCol = t.feuille.getLastColumn();
  const valeurs = t.feuille.getRange(2, 1, n, nbCol).getValues();
  return valeurs.map((v, i) => {
    const o = { ligne: i + 2 };
    for (const [champ] of COLONNES) o[champ] = String(v[t.col[champ] - 1] == null ? "" : v[t.col[champ] - 1]);
    return o;
  });
}

const statut_ = (l) => (norm_(l.valide) === "oui" ? "valide" : norm_(l.valide) === "non" ? "refuse" : "attente");

function avecVerrou_(fn) {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try { return fn(); } finally { verrou.releaseLock(); }
}

/* ---------- Élèves ---------- */

function lire_(d) {
  if (!estClasse_(d.code)) return refus_;
  const t = ouvrir_();
  const csv = [COLONNES.slice(0, COLONNES_PUBLIQUES).map((c) => csvChamp_(c[1])).join(",")];
  for (const l of lignes_(t)) {
    if (l.titre && statut_(l) === "valide") {
      csv.push(COLONNES.slice(0, COLONNES_PUBLIQUES).map(([champ]) => csvChamp_(l[champ])).join(","));
    }
  }
  return { ok: true, csv: csv.join("\n") };
}

function csvChamp_(v) {
  return '"' + String(v).replace(/"/g, '""') + '"';
}

// Le PDF d'un texte publié (ou n'importe lequel pour l'admin), en base64, pour l'afficher dans l'appli.
function pdf_(d) {
  if (!estClasse_(d.code)) return refus_;
  const id = String(d.id || "");
  if (!/^[\w-]{10,}$/.test(id)) return { ok: false, erreur: "Fichier introuvable." };

  const admin = estAdmin_(d.code);
  const t = ouvrir_();
  const autorise = lignes_(t).some((l) => l.lien.indexOf(id) >= 0 && (admin || statut_(l) === "valide"));
  if (!autorise) return { ok: false, erreur: "Fichier introuvable." };

  let fichier;
  try { fichier = DriveApp.getFileById(id); } catch (err) { return { ok: false, erreur: "Fichier introuvable." }; }
  if (fichier.getSize() > PDF_MAX_LECTURE) return { ok: false, erreur: "Fichier trop gros pour être affiché." };
  const blob = fichier.getBlob();
  if (blob.getContentType() !== "application/pdf") return { ok: false, erreur: "Ce fichier n'est pas un PDF." };
  return { ok: true, nom: fichier.getName(), donnees: Utilities.base64Encode(blob.getBytes()) };
}

const LIMITES = { format: 40, titre: 150, auteur: 100, personnages: 150, echeance: 40, type: 40, siecle: 10, registre: 40 };

// Vérifie et nettoie les champs d'un texte (proposition ou modification). Renvoie { f } ou { erreur }.
function champs_(d) {
  const f = {};
  for (const champ of Object.keys(LIMITES)) f[champ] = texte_(d[champ], LIMITES[champ]);
  f.duree = texte_(d.duree, 6).replace(",", ".");

  for (const champ of ["titre", "auteur", "personnages"]) {
    if (!f[champ]) return { erreur: "Il manque un champ obligatoire." };
  }
  for (const champ of Object.keys(LISTES)) {
    if (LISTES[champ].indexOf(f[champ]) < 0) return { erreur: "Une des listes n'est pas remplie." };
  }
  const minutes = Number(f.duree);
  if (!(minutes >= 1 && minutes <= 60)) return { erreur: "La durée doit être entre 1 et 60 minutes." };
  return { f };
}

// Deux propositions sont les mêmes si titre, auteur et personnages sont identiques (accents et majuscules ignorés).
const cleDoublon_ = (l) => [l.titre, l.auteur, l.personnages].map(norm_).join("|");

function proposer_(d) {
  // Le champ piège est invisible : seul un robot le remplit. On répond « ok » sans rien enregistrer.
  if (d.site) return { ok: true };
  if (!estClasse_(d.code)) return refus_;

  const verifie = champs_(d);
  if (verifie.erreur) return { ok: false, erreur: verifie.erreur };
  const f = verifie.f;
  f.prenom = texte_(d.prenom, 40);
  f.lien = texte_(d.lien, 500);
  if (!f.prenom) return { ok: false, erreur: "Il manque un champ obligatoire." };

  let octets = null;
  if (d.pdf && d.pdf.donnees) {
    octets = Utilities.base64Decode(String(d.pdf.donnees));
    if (octets.length > PDF_MAX) return { ok: false, erreur: "Le PDF dépasse 5 Mo." };
    // Un vrai PDF commence par « %PDF ».
    if (!(octets[0] === 0x25 && octets[1] === 0x50 && octets[2] === 0x44 && octets[3] === 0x46)) return { ok: false, erreur: "Ce fichier n'est pas un PDF." };
  } else if (!/^https?:\/\//i.test(f.lien)) {
    return { ok: false, erreur: "Ajoute un PDF ou un lien vers le texte." };
  }

  return avecVerrou_(() => {
    const t = ouvrir_();
    const cle = cleDoublon_(f);
    const existant = lignes_(t).find((l) => l.titre && statut_(l) !== "refuse" && cleDoublon_(l) === cle);
    if (existant) {
      return {
        ok: false, doublon: true,
        erreur: statut_(existant) === "valide" ? "Ce texte est déjà dans le catalogue." : "Ce texte a déjà été proposé : il attend sa validation."
      };
    }

    if (octets) {
      const nom = texte_(d.pdf.nom, 120).replace(/[\\/:*?"<>|]/g, "-").replace(/\.pdf$/i, "") || f.titre;
      const blob = Utilities.newBlob(octets, "application/pdf", nom + ".pdf");
      const fichier = dossierPdf_().createFile(blob);
      f.lien = "https://drive.google.com/file/d/" + fichier.getId() + "/view";
    }
    f.valide = modeAuto_() ? "oui" : "";
    f.id = Utilities.getUuid().slice(0, 8);
    f.date = new Date().toISOString();

    const nbCol = t.feuille.getLastColumn();
    const ligne = new Array(nbCol).fill("");
    for (const [champ] of COLONNES) ligne[t.col[champ] - 1] = f[champ] == null ? "" : f[champ];
    // Format « texte » : un titre commençant par « = » ne doit jamais devenir une formule.
    const numero = t.feuille.getLastRow() + 1;
    if (numero > t.feuille.getMaxRows()) t.feuille.insertRowsAfter(t.feuille.getMaxRows(), 1);
    const cible = t.feuille.getRange(numero, 1, 1, nbCol);
    cible.setNumberFormat("@");
    cible.setValues([ligne]);
    return { ok: true, id: f.id, publie: f.valide === "oui" };
  });
}

// « Mes propositions » : l'appli envoie les identifiants qu'elle a reçus à l'envoi, le serveur répond avec leur état.
function mes_(d) {
  if (!estClasse_(d.code)) return refus_;
  const ids = (Array.isArray(d.ids) ? d.ids : []).map(String).slice(0, 50);
  const t = ouvrir_();
  const parId = {};
  for (const l of lignes_(t)) if (l.id) parId[l.id] = l;
  return { ok: true, textes: ids.map((id) => (parId[id] ? { id, statut: statut_(parId[id]) } : { id, statut: "retire" })) };
}

function dossierPdf_() {
  const dossiers = DriveApp.getFoldersByName(NOM_DOSSIER_PDF);
  return dossiers.hasNext() ? dossiers.next() : DriveApp.createFolder(NOM_DOSSIER_PDF);
}

/* ---------- Admin ---------- */

function adminListe_(d) {
  if (!estAdmin_(d.code)) return refus_;
  return avecVerrou_(() => {
    const t = ouvrir_();
    // Les lignes ajoutées à la main n'ont pas encore d'identifiant : on leur en donne un.
    const sans = lignes_(t).filter((l) => l.titre && !l.id);
    for (const l of sans) {
      l.id = Utilities.getUuid().slice(0, 8);
      t.feuille.getRange(l.ligne, t.col.id).setValue(l.id);
    }
    const liste = lignes_(t).filter((l) => l.titre).map((l) => ({
      id: l.id, date: l.date, statut: statut_(l),
      format: l.format, titre: l.titre, auteur: l.auteur, personnages: l.personnages, echeance: l.echeance,
      type: l.type, siecle: l.siecle, registre: l.registre, duree: l.duree, lien: l.lien, prenom: l.prenom
    }));
    return { ok: true, auto: modeAuto_(), textes: liste.reverse() }; // les plus récents d'abord
  });
}

function adminDecision_(d) {
  if (!estAdmin_(d.code)) return refus_;
  const decision = String(d.decision || "");
  if (["valider", "refuser", "attente", "supprimer"].indexOf(decision) < 0) return { ok: false, erreur: "Action inconnue." };

  return avecVerrou_(() => {
    const t = ouvrir_();
    const l = lignes_(t).find((x) => x.id && x.id === String(d.id || ""));
    if (!l) return { ok: false, erreur: "Texte introuvable (déjà supprimé ?)." };

    if (decision === "supprimer") {
      mettreAuRebut_(l.lien);
      t.feuille.deleteRow(l.ligne);
    } else {
      const cellule = t.feuille.getRange(l.ligne, t.col.valide);
      cellule.setNumberFormat("@");
      cellule.setValue(decision === "valider" ? "oui" : decision === "refuser" ? "non" : "");
    }
    return { ok: true };
  });
}

// Ne met à la corbeille que les PDF que le site a lui-même créés (dans son dossier).
function mettreAuRebut_(lien) {
  const m = String(lien).match(/drive\.google\.com\/file\/d\/([\w-]{10,})/);
  if (!m) return;
  try {
    const fichier = DriveApp.getFileById(m[1]);
    const dossiers = fichier.getParents();
    while (dossiers.hasNext()) {
      if (dossiers.next().getName() === NOM_DOSSIER_PDF) { fichier.setTrashed(true); return; }
    }
  } catch (err) {
    // Fichier déjà supprimé ou hors de portée : la ligne part quand même.
  }
}

function adminModifier_(d) {
  if (!estAdmin_(d.code)) return refus_;
  const verifie = champs_(d.champs || {});
  if (verifie.erreur) return { ok: false, erreur: verifie.erreur };

  return avecVerrou_(() => {
    const t = ouvrir_();
    const l = lignes_(t).find((x) => x.id && x.id === String(d.id || ""));
    if (!l) return { ok: false, erreur: "Texte introuvable (déjà supprimé ?)." };
    for (const champ of Object.keys(verifie.f)) {
      const cellule = t.feuille.getRange(l.ligne, t.col[champ]);
      cellule.setNumberFormat("@");
      cellule.setValue(verifie.f[champ]);
    }
    return { ok: true, champs: verifie.f };
  });
}

function adminMode_(d) {
  if (!estAdmin_(d.code)) return refus_;
  PropertiesService.getScriptProperties().setProperty("MODE_AUTO", d.auto ? "oui" : "non");
  return { ok: true, auto: modeAuto_() };
}


/* ---------- Échéance : ordre de passage ---------- */
// Source de l'ordre : le Google Sheet de la classe (lu en direct, jamais copié). La liste du prof (collée dans l'admin)
// apporte les noms complets et le texte joué par chacun. Les deux sont rapprochés par le prénom.

const CACHE_PASSAGES = "passages_brut";
const VIDES_ = ["", "/", "-", "x", "aucun", "aucune", "rien", "non", "ras", "n/a", "neant"];
const vide_ = (v) => VIDES_.indexOf(norm_(v).replace(/[.–—]/g, "")) >= 0;
const coupe_ = (v, max) => texte_(v, max);

const idSheet_ = (url) => {
  const m = String(url || "").match(/\/d\/([\w-]{20,})/) || String(url || "").trim().match(/^([\w-]{20,})$/);
  return m ? m[1] : "";
};

// Cherche la ligne d'en-tête (« Ordre de passage », « Comédien »…) dans les premières lignes d'un onglet.
function reperer_(v) {
  for (let i = 0; i < Math.min(v.length, 6); i++) {
    const n = v[i].map(norm_);
    const iOrdre = n.findIndex((x) => x.indexOf("ordre") === 0);
    const iCom = n.findIndex((x) => x.indexOf("comedien") === 0);
    if (iOrdre < 0 || iCom < 0) continue;
    const premier = (debut) => n.findIndex((x) => x.indexOf(debut) === 0);
    return {
      ligne: i, ordre: iOrdre, comedien: iCom, materiel: premier("materiel"), mise: premier("mise en scene"), texte: premier("texte"),
      regisseurs: n.map((x, j) => (x.indexOf("regisseur") === 0 ? j : -1)).filter((j) => j >= 0)
    };
  }
  return null;
}

// Lit le Sheet de la classe : { titre, groupes: [{ nom, lignes: [...] }] }. Gardé 60 s en cache (les élèves rechargent souvent).
function lireSheetClasse_(frais) {
  const id = prop_("PASSAGES_SHEET_ID");
  if (!id) return null;
  const cache = CacheService.getScriptCache();
  if (!frais) {
    const garde = cache.get(CACHE_PASSAGES);
    if (garde) return JSON.parse(garde);
  }
  const ss = SpreadsheetApp.openById(id);
  const groupes = [];
  for (const feuille of ss.getSheets()) {
    const v = feuille.getDataRange().getDisplayValues();
    const c = reperer_(v);
    if (!c) continue;
    const cell = (l, j) => (j >= 0 && l[j] != null ? coupe_(l[j], 400) : "");
    const lignes = [];
    for (const l of v.slice(c.ligne + 1, c.ligne + 301)) {
      if (!cell(l, c.comedien)) continue;
      lignes.push({
        ordre: cell(l, c.ordre), comedien: cell(l, c.comedien), materiel: cell(l, c.materiel), mise: cell(l, c.mise),
        texte: cell(l, c.texte), regisseurs: c.regisseurs.map((j) => cell(l, j)).filter((x) => x && !vide_(x))
      });
    }
    groupes.push({ nom: coupe_(feuille.getName(), 60), lignes });
  }
  const brut = { titre: coupe_(ss.getName(), 120), groupes };
  try { cache.put(CACHE_PASSAGES, JSON.stringify(brut), 60); } catch (err) { /* trop gros pour le cache : on relira */ }
  return brut;
}

// « Laure CAVAT » -> { prenom: "Laure", nom: "CAVAT" } : le nom de famille = les mots finaux tout en majuscules.
function separerNom_(s) {
  const mots = String(s).trim().split(/\s+/).filter(Boolean);
  const maj = (m) => m.length > 1 && m === m.toUpperCase() && m !== m.toLowerCase();
  let i = mots.length;
  while (i > 1 && maj(mots[i - 1])) i--;
  return { prenom: mots.slice(0, i).join(" "), nom: mots.slice(i).join(" ") };
}

// Lit la liste du prof : titres de section (« DISCOURS ») puis lignes « 1. Prénom NOM - Texte ».
function lireListeProf_(texte) {
  const entrees = [];
  let groupe = "";
  for (const brute of String(texte).split(/\r?\n/)) {
    const ligne = brute.trim();
    if (!ligne) continue;
    const m = ligne.match(/^(\d+)\s*[.)]\s*(.+?)\s+[-–—]\s+(.+)$/);
    if (m) {
      if (!groupe) continue;
      const { prenom, nom } = separerNom_(m[2]);
      entrees.push({ g: groupe, ordre: Number(m[1]), prenom: coupe_(prenom, 40), nom: coupe_(nom, 40), texte: coupe_(m[3], 150) });
    } else if (!/\d/.test(ligne) && ligne === ligne.toUpperCase() && ligne !== ligne.toLowerCase() && ligne.length < 40) {
      groupe = ligne.charAt(0) + ligne.slice(1).toLowerCase();
    }
  }
  return entrees;
}

const complet_ = (p) => (p.prenom + " " + p.nom).trim();
const cleProf_ = (p) => norm_(complet_(p));
const lireJson_ = (nom, defaut) => { try { return JSON.parse(prop_(nom)) || defaut; } catch (err) { return defaut; } };

// Rapproche chaque ligne du Sheet d'une entrée de la liste du prof. Renvoie les lignes enrichies + ce qu'il reste à régler.
function fusionner_(brut) {
  const prof = lireJson_("PASSAGES_PROF", []);
  const alias = lireJson_("PASSAGES_ALIAS", {});
  const reclame = {};
  const aRapprocher = [];

  // Deux élèves portent le même prénom : leur nom s'affichera avec l'initiale (« Laure C. »).
  const compte = {};
  const vus = {};
  for (const p of prof) { if (!vus[cleProf_(p)]) { vus[cleProf_(p)] = 1; compte[norm_(p.prenom)] = (compte[norm_(p.prenom)] || 0) + 1; } }
  const affiche = (p) => (compte[norm_(p.prenom)] > 1 && p.nom ? p.prenom + " " + p.nom.charAt(0) + "." : p.prenom);

  const groupes = brut.groupes.map((g) => ({ nom: g.nom, cle: norm_(g.nom), lignes: g.lignes.map((l) => ({ ...l })) }));
  // Clé d'une ligne pour retenir un rapprochement : groupe|comédien, et le numéro de passage si le même prénom revient dans l'onglet.
  for (const g of groupes) {
    const nb = {};
    for (const l of g.lignes) nb[norm_(l.comedien)] = (nb[norm_(l.comedien)] || 0) + 1;
    for (const l of g.lignes) l._cle = g.cle + "|" + norm_(l.comedien) + (nb[norm_(l.comedien)] > 1 ? "|" + norm_(l.ordre) : "");
  }

  // Passe 1 : les correspondances sûres.
  for (const g of groupes) {
    const dansGroupe = prof.filter((p) => norm_(p.g) === g.cle);
    for (const l of g.lignes) {
      const nc = norm_(l.comedien);
      let trouve = null;
      const aliase = alias[l._cle];
      if (aliase) trouve = dansGroupe.find((p) => cleProf_(p) === aliase) || null;
      if (!trouve) {
        const { prenom, nom } = separerNom_(l.comedien);
        const initiale = nc.match(/^(.*\S)\s+([a-z])\.?$/); // « Laure C. »
        let candidats = dansGroupe.filter((p) => norm_(p.prenom) === norm_(prenom));
        if (candidats.length > 1 && nom) candidats = candidats.filter((p) => norm_(p.nom) === norm_(nom));
        if (candidats.length === 0 && initiale) candidats = dansGroupe.filter((p) => norm_(p.prenom) === initiale[1] && norm_(p.nom).charAt(0) === initiale[2]);
        if (candidats.length > 1 && initiale) candidats = candidats.filter((p) => norm_(p.nom).charAt(0) === initiale[2]);
        if (candidats.length === 1) trouve = candidats[0];
        else l._candidats = candidats; // plusieurs possibles
      }
      if (trouve) { l._prof = trouve; reclame[g.cle + "|" + cleProf_(trouve)] = true; }
    }
  }

  // Passe 2 : ce qu'il reste. Un prénom ambigu propose ses homonymes ; un inconnu propose les noms de la liste non encore attribués.
  for (const g of groupes) {
    const libres = prof.filter((p) => norm_(p.g) === g.cle && !reclame[g.cle + "|" + cleProf_(p)]);
    for (const l of g.lignes) {
      if (l._prof) continue;
      const ambigu = Boolean(l._candidats && l._candidats.length);
      if (prof.length) aRapprocher.push({ cle: l._cle, groupe: g.nom, comedien: l.comedien, ordre: l.ordre, raison: ambigu ? "ambigu" : "inconnu", candidats: (ambigu ? l._candidats : libres).map(complet_) });
    }
  }
  const absents = [];
  for (const g of groupes) {
    for (const p of prof.filter((x) => norm_(x.g) === g.cle && !reclame[g.cle + "|" + cleProf_(x)])) absents.push({ groupe: g.nom, nom: complet_(p), texte: p.texte });
  }

  const sortie = groupes.map((g) => ({
    nom: g.nom,
    lignes: g.lignes.map((l) => {
      const p = l._prof;
      return {
        ordre: l.ordre,
        nom: p ? affiche(p) : l.comedien,
        personne: p ? cleProf_(p) : "~" + norm_(l.comedien),
        texte: l.texte || (p ? p.texte : ""),
        materiel: vide_(l.materiel) ? "" : l.materiel,
        mise: vide_(l.mise) ? "" : l.mise,
        regisseurs: l.regisseurs
      };
    })
  }));
  return { groupes: sortie, aRapprocher, absents, profCount: prof.length };
}

function passages_(d) {
  if (!estClasse_(d.code)) return refus_;
  const brut = lireSheetClasse_(false);
  if (!brut) return { ok: true, vide: true };
  const f = fusionner_(brut);
  return { ok: true, titre: brut.titre, groupes: f.groupes };
}

/* ---------- Échéance : admin ---------- */

function etatPassages_(frais) {
  const brut = lireSheetClasse_(frais);
  if (!brut) return { ok: true, configure: false };
  const f = fusionner_(brut);
  return {
    ok: true, configure: true, titre: brut.titre,
    onglets: brut.groupes.map((g) => ({ nom: g.nom, nb: g.lignes.length })),
    profCount: f.profCount, aRapprocher: f.aRapprocher, absents: f.absents
  };
}

function adminPassages_(d) {
  if (!estAdmin_(d.code)) return refus_;
  try {
    return etatPassages_(true);
  } catch (err) {
    return { ok: false, erreur: "Impossible de lire le Google Sheet de l'échéance. Vérifie qu'il est partagé avec le lien." };
  }
}

function adminPassagesSheet_(d) {
  if (!estAdmin_(d.code)) return refus_;
  const id = idSheet_(d.url);
  if (!id) return { ok: false, erreur: "Ce lien n'est pas celui d'un Google Sheet." };
  let ss;
  try { ss = SpreadsheetApp.openById(id); } catch (err) {
    return { ok: false, erreur: "Impossible d'ouvrir ce Google Sheet. Il doit être partagé « Tous les utilisateurs disposant du lien » (ou avec ton compte)." };
  }
  const onglets = ss.getSheets().filter((f) => reperer_(f.getDataRange().getDisplayValues()));
  if (!onglets.length) return { ok: false, erreur: "Aucun onglet n'a les colonnes « Ordre de passage » et « Comédien »." };

  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("PASSAGES_SHEET_ID") !== id) {
    // Nouvelle échéance : l'ancienne liste du prof et les rapprochements ne valent plus.
    props.deleteProperty("PASSAGES_PROF");
    props.deleteProperty("PASSAGES_ALIAS");
  }
  props.setProperty("PASSAGES_SHEET_ID", id);
  CacheService.getScriptCache().remove(CACHE_PASSAGES);
  return etatPassages_(true);
}

function adminPassagesProf_(d) {
  if (!estAdmin_(d.code)) return refus_;
  const entrees = lireListeProf_(d.texte);
  if (!entrees.length) return { ok: false, erreur: "Je n'ai reconnu aucune ligne. Colle la liste telle quelle : « DISCOURS » puis « 1. Prénom NOM - Texte »." };
  const json = JSON.stringify(entrees);
  if (json.length > 8500) return { ok: false, erreur: "La liste est trop longue (maximum environ 90 lignes)." };
  const props = PropertiesService.getScriptProperties();
  props.setProperty("PASSAGES_PROF", json);
  props.deleteProperty("PASSAGES_ALIAS");
  return etatPassages_(false);
}

function adminPassagesAlias_(d) {
  if (!estAdmin_(d.code)) return refus_;
  const cleLigne = String(d.cle || "");
  const groupe = cleLigne.split("|")[0];
  if (!groupe || cleLigne.length > 200) return { ok: false, erreur: "Demande incomplète." };
  const alias = lireJson_("PASSAGES_ALIAS", {});
  const cle = norm_(d.nom);
  if (cle) {
    const existe = lireJson_("PASSAGES_PROF", []).some((p) => norm_(p.g) === groupe && cleProf_(p) === cle);
    if (!existe) return { ok: false, erreur: "Ce nom n'est pas dans la liste du prof." };
    alias[cleLigne] = cle;
  } else {
    delete alias[cleLigne];
  }
  PropertiesService.getScriptProperties().setProperty("PASSAGES_ALIAS", JSON.stringify(alias));
  return etatPassages_(false);
}
