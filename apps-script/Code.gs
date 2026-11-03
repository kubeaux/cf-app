// La Truculance — serveur (Google Apps Script, à coller dans le script lié au Google Sheet).
//
// Réglages à créer dans « Paramètres du projet » > « Propriétés du script » (jamais dans ce fichier) :
//   CODE_CLASSE : le code que tapent les élèves
//   CODE_ADMIN  : ton code à toi pour la page admin (long, différent du code de la classe)
//   MODE_AUTO   : « oui » = les propositions sont publiées sans validation (se règle depuis la page admin)
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
      case "admin_liste": return reponse_(adminListe_(d));
      case "admin_decision": return reponse_(adminDecision_(d));
      case "admin_mode": return reponse_(adminMode_(d));
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

function proposer_(d) {
  // Le champ piège est invisible : seul un robot le remplit. On répond « ok » sans rien enregistrer.
  if (d.site) return { ok: true };
  if (!estClasse_(d.code)) return refus_;

  const f = {};
  const limites = { format: 40, titre: 150, auteur: 100, personnages: 150, echeance: 40, type: 40, siecle: 10, registre: 40, prenom: 40 };
  for (const champ of Object.keys(limites)) f[champ] = texte_(d[champ], limites[champ]);
  f.duree = texte_(d.duree, 6).replace(",", ".");
  f.lien = texte_(d.lien, 500);

  for (const champ of ["titre", "auteur", "personnages", "prenom"]) {
    if (!f[champ]) return { ok: false, erreur: "Il manque un champ obligatoire." };
  }
  for (const champ of Object.keys(LISTES)) {
    if (LISTES[champ].indexOf(f[champ]) < 0) return { ok: false, erreur: "Une des listes n'est pas remplie." };
  }
  const minutes = Number(f.duree);
  if (!(minutes >= 1 && minutes <= 60)) return { ok: false, erreur: "La durée doit être entre 1 et 60 minutes." };

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
    if (octets) {
      const nom = texte_(d.pdf.nom, 120).replace(/[\\/:*?"<>|]/g, "-").replace(/\.pdf$/i, "") || f.titre;
      const blob = Utilities.newBlob(octets, "application/pdf", nom + ".pdf");
      const fichier = dossierPdf_().createFile(blob);
      f.lien = "https://drive.google.com/file/d/" + fichier.getId() + "/view";
    }
    f.valide = modeAuto_() ? "oui" : "";
    f.id = Utilities.getUuid().slice(0, 8);
    f.date = new Date().toISOString();

    const t = ouvrir_();
    const nbCol = t.feuille.getLastColumn();
    const ligne = new Array(nbCol).fill("");
    for (const [champ] of COLONNES) ligne[t.col[champ] - 1] = f[champ] == null ? "" : f[champ];
    // Format « texte » : un titre commençant par « = » ne doit jamais devenir une formule.
    const numero = t.feuille.getLastRow() + 1;
    if (numero > t.feuille.getMaxRows()) t.feuille.insertRowsAfter(t.feuille.getMaxRows(), 1);
    const cible = t.feuille.getRange(numero, 1, 1, nbCol);
    cible.setNumberFormat("@");
    cible.setValues([ligne]);
    return { ok: true };
  });
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

function adminMode_(d) {
  if (!estAdmin_(d.code)) return refus_;
  PropertiesService.getScriptProperties().setProperty("MODE_AUTO", d.auto ? "oui" : "non");
  return { ok: true, auto: modeAuto_() };
}
