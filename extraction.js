// Remplit le formulaire à partir du PDF joint : lit le texte du PDF et devine titre, auteur, personnages, type, durée…
// « deviner » ne dépend pas du navigateur (testable avec Node) ; « analyserPdf » lit le fichier avec pdf.js (dossier vendor/).
// Ce sont des suggestions : l'élève relit et corrige avant d'envoyer.

// [noms reconnus dans le texte, nom affiché, siècle ("" si l'œuvre peut être de deux siècles)]
const AUTEURS = [
  [["Molière"], "Molière", "XVIIe"],
  [["Racine", "Jean Racine"], "Jean Racine", "XVIIe"],
  [["Corneille", "Pierre Corneille"], "Pierre Corneille", "XVIIe"],
  [["Marivaux"], "Marivaux", "XVIIIe"],
  [["Beaumarchais"], "Beaumarchais", "XVIIIe"],
  [["Voltaire"], "Voltaire", "XVIIIe"],
  [["Diderot", "Denis Diderot"], "Denis Diderot", "XVIIIe"],
  [["Musset", "Alfred de Musset"], "Alfred de Musset", "XIXe"],
  [["Victor Hugo"], "Victor Hugo", "XIXe"],
  [["Alfred de Vigny"], "Alfred de Vigny", "XIXe"],
  [["Alexandre Dumas"], "Alexandre Dumas", "XIXe"],
  [["Rostand", "Edmond Rostand"], "Edmond Rostand", "XIXe"],
  [["Labiche", "Eugène Labiche"], "Eugène Labiche", "XIXe"],
  [["Feydeau", "Georges Feydeau"], "Georges Feydeau", ""],
  [["Courteline", "Georges Courteline"], "Georges Courteline", ""],
  [["Alfred Jarry", "Jarry"], "Alfred Jarry", ""],
  [["Claudel", "Paul Claudel"], "Paul Claudel", "XXe"],
  [["Giraudoux", "Jean Giraudoux"], "Jean Giraudoux", "XXe"],
  [["Cocteau", "Jean Cocteau"], "Jean Cocteau", "XXe"],
  [["Anouilh", "Jean Anouilh"], "Jean Anouilh", "XXe"],
  [["Sartre", "Jean-Paul Sartre"], "Jean-Paul Sartre", "XXe"],
  [["Albert Camus"], "Albert Camus", "XXe"],
  [["Ionesco", "Eugène Ionesco"], "Eugène Ionesco", "XXe"],
  [["Beckett", "Samuel Beckett"], "Samuel Beckett", "XXe"],
  [["Jean Genet"], "Jean Genet", "XXe"],
  [["Pagnol", "Marcel Pagnol"], "Marcel Pagnol", "XXe"],
  [["Sacha Guitry"], "Sacha Guitry", "XXe"],
  [["Boris Vian"], "Boris Vian", "XXe"],
  [["Koltès", "Bernard-Marie Koltès"], "Bernard-Marie Koltès", "XXe"],
  [["Lagarce", "Jean-Luc Lagarce"], "Jean-Luc Lagarce", "XXe"],
  [["Vinaver", "Michel Vinaver"], "Michel Vinaver", "XXe"],
  [["Marguerite Duras"], "Marguerite Duras", "XXe"],
  [["Nathalie Sarraute"], "Nathalie Sarraute", "XXe"],
  [["Brecht", "Bertolt Brecht"], "Bertolt Brecht", "XXe"],
  [["Pirandello", "Luigi Pirandello"], "Luigi Pirandello", "XXe"],
  [["Tennessee Williams"], "Tennessee Williams", "XXe"],
  [["Arthur Miller"], "Arthur Miller", "XXe"],
  [["Pommerat", "Joël Pommerat"], "Joël Pommerat", "XXIe"],
  [["Mouawad", "Wajdi Mouawad"], "Wajdi Mouawad", ""],
  [["Yasmina Reza"], "Yasmina Reza", ""],
  [["Shakespeare", "William Shakespeare"], "William Shakespeare", ""],
  [["Tchekhov", "Tchékhov", "Anton Tchekhov"], "Anton Tchekhov", ""],
  [["Ibsen", "Henrik Ibsen"], "Henrik Ibsen", "XIXe"],
  [["Strindberg", "August Strindberg"], "August Strindberg", "XIXe"],
  [["Oscar Wilde"], "Oscar Wilde", "XIXe"],
  [["Büchner", "Georg Büchner"], "Georg Büchner", "XIXe"],
  [["Schiller", "Friedrich Schiller"], "Friedrich Schiller", "XVIIIe"],
  [["Goldoni", "Carlo Goldoni"], "Carlo Goldoni", "XVIIIe"],
  [["Lope de Vega"], "Lope de Vega", "XVIIe"],
  [["Calderón", "Pedro Calderón"], "Pedro Calderón", "XVIIe"],
  [["Sophocle"], "Sophocle", ""],
  [["Eschyle"], "Eschyle", ""],
  [["Euripide"], "Euripide", ""],
  [["Aristophane"], "Aristophane", ""]
];

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Pas de « lookbehind » (?<!…) : il casserait la page sur les iPhone un peu anciens.
const AUTEURS_RE = AUTEURS.map(([variantes, nom, siecle]) => ({
  nom,
  siecle,
  re: new RegExp(
    `(?:^|[^\\p{L}])(${variantes.flatMap((v) => [v, v.toLocaleUpperCase("fr")]).map(echapper).join("|")})(?![\\p{L}])`,
    "u"
  )
}));

// Mots qui, en début de ligne, annoncent un en-tête et non un personnage (« ACTE IV », « INT. CUISINE »…).
const MOTS_STRUCTURE = new Set([
  "ACTE", "SCENE", "SCÈNE", "TABLEAU", "FIN", "PERSONNAGES", "ACTEURS", "DISTRIBUTION", "PROLOGUE", "EPILOGUE", "ÉPILOGUE",
  "INT", "EXT", "FONDU", "COUPE", "NOIR", "RIDEAU", "NOTE", "NOTES", "PAGE", "CHAPITRE", "PARTIE", "SEQUENCE", "SÉQUENCE",
  "SYNOPSIS", "RESUME", "RÉSUMÉ", "EXTRAIT", "TITRE", "AUTEUR", "TEXTE", "COMEDIE", "COMÉDIE"
]);
// Mots qui ne sont pas un personnage lorsqu'ils sont seuls (« TOUS. » est une réplique collective).
const MOTS_VIDES = new Set([
  "UN", "UNE", "LE", "LA", "LES", "DE", "DU", "DES", "ET", "SEUL", "SEULE", "ENTRE", "SORT", "EXIT", "ILS", "ELLES",
  "TOUS", "TOUTES", "OUI", "NON", "VOIX"
]);

const norm = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function titreCase(s) {
  return s
    .toLocaleLowerCase("fr")
    .replace(/(^|[\s'’-])(\p{L})/gu, (m, avant, lettre) => avant + lettre.toLocaleUpperCase("fr"))
    .replace(/\s(De|Du|Des|La|Le|Les|Et)(?=\s)/g, (m) => m.toLowerCase());
}

// « L'AVARE » → « L'Avare » ; un titre déjà en minuscules reste tel quel.
const joliTitre = (s) => (/\p{Ll}/u.test(s) ? s : titreCase(s));

function titrePlausible(s) {
  const t = String(s ?? "").trim();
  if (t.length < 2 || t.length > 100 || !/\p{L}/u.test(t)) return false;
  return !/microsoft|\.docx?\b|\.pdf\b|^untitled|^sans titre|^document\b|^page\b|^(acte|sc[eè]ne|tableau)\b/i.test(t);
}

function trouverAuteur(zones) {
  let meilleur = null;
  for (const zone of zones) {
    if (!zone) continue;
    for (const a of AUTEURS_RE) {
      const m = a.re.exec(zone);
      if (m && (!meilleur || m.index < meilleur.index)) meilleur = { ...a, index: m.index };
    }
    if (meilleur) break;
  }
  return meilleur;
}

const CUE_MAJUSCULES = /^([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'’ .-]{1,29}?)\s*(?:[.:,(]|\s[—–-]\s?|$)/u;
const CUE_MINUSCULES = /^(\p{Lu}\p{Ll}[\p{L}'’-]*(?: \p{Lu}\p{Ll}[\p{L}'’-]*)?)\s*:\s*\S/u;

function trouverPersonnages(lignes, exclus) {
  const compte = new Map();
  const ajouter = (nom, fort) => {
    const cle = norm(nom);
    if (!cle || exclus.has(cle)) return;
    const mots = nom.trim().split(/\s+/);
    if (mots.length > 3 || /^[IVXLC]+$/.test(nom.trim())) return;
    const premier = mots[0].replace(/[.,:]$/, "").toLocaleUpperCase("fr");
    if (MOTS_STRUCTURE.has(premier) || (mots.length === 1 && MOTS_VIDES.has(premier))) return;
    const e = compte.get(cle) ?? { nom: nom.trim().replace(/[.\s]+$/, ""), n: 0, fort: 0 };
    e.n++;
    if (fort) e.fort++;
    compte.set(cle, e);
  };

  for (const ligne of lignes) {
    const l = ligne.trim();
    if (l.length < 2 || l.length > 140) continue;
    const maj = CUE_MAJUSCULES.exec(l);
    if (maj) { ajouter(maj[1], true); continue; }
    const min = CUE_MINUSCULES.exec(l);
    if (min) ajouter(min[1], false);
  }

  const tous = [...compte.values()];
  let gardes = tous.filter((e) => e.n >= 2);
  if (gardes.length === 0) gardes = tous.filter((e) => e.fort > 0).length <= 2 ? tous.filter((e) => e.fort > 0) : [];
  return gardes.sort((a, b) => b.n - a.n).slice(0, 6).map((e) => titreCase(e.nom));
}

function devinerFormat(texte) {
  if ((texte.match(/^\s*(?:INT|EXT)[.\s]/gm) || []).length >= 2) return "Film";
  if (/\b(?:ACTE|SC[ÈE]NE)\s+(?:[IVX]+|\d+|premi)/i.test(texte)) return "Pièce de théâtre";
  return "";
}

/**
 * @param {string} texte     texte extrait du PDF
 * @param {string} nomFichier ex. « Cyrano - Rostand.pdf »
 * @param {{titre?: string, auteur?: string}} meta  métadonnées du PDF
 * @param {{partiel?: boolean}} options  partiel = seules les premières pages ont été lues
 */
function deviner(texte, nomFichier = "", meta = {}, options = {}) {
  texte = String(texte ?? "").replace(/\r/g, "");
  const lignes = texte.split("\n").map((l) => l.trim()).filter(Boolean);
  const base = String(nomFichier).replace(/\.pdf$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

  // Auteur : un nom connu dans le nom du fichier, puis dans le début du texte. Les métadonnées ne servent que si elles
  // contiennent un auteur connu (sinon c'est souvent le nom de la personne qui a fabriqué le PDF).
  const connu = trouverAuteur([base, lignes.slice(0, 25).join("\n").slice(0, 2000), meta.auteur]);

  // Titre : métadonnées, puis nom du fichier « Titre - Auteur », puis première ligne plausible, puis nom du fichier.
  const parties = base.split(/\s+[-–—]\s+/).filter(Boolean);
  let titre = "";
  if (titrePlausible(meta.titre) && !/\.\w{2,4}$/.test(meta.titre)) titre = meta.titre.trim();
  if (!titre && parties.length === 2) {
    const [a, b] = parties;
    const aAuteur = trouverAuteur([a]);
    titre = aAuteur && !trouverAuteur([b]) ? b : a;
  }
  if (!titre) {
    const ligne = lignes.slice(0, 8).find((l) => l.length >= 3 && l.length <= 60 && titrePlausible(l) && !/[.:;,]$/.test(l) && !(connu && norm(l) === norm(connu.nom)));
    titre = ligne || base;
  }
  titre = joliTitre(titre.trim());

  let auteur = connu ? connu.nom : "";
  if (!auteur && parties.length === 2) {
    // Seulement si le titre vient du nom du fichier : l'autre moitié est alors l'auteur.
    const [a, b] = parties;
    const autre = norm(titre) === norm(a) ? b : norm(titre) === norm(b) ? a : "";
    if (autre && autre.length <= 50) auteur = joliTitre(autre);
  }

  // Personnages : on ignore ce qui ressemble au titre ou à l'auteur (un en-tête « L'AVARE » n'est pas un personnage).
  const exclus = new Set([norm(titre), norm(auteur), norm(connu?.nom), ...(connu ? [norm(connu.nom).split(" ").pop()] : [])].filter(Boolean));
  const noms = trouverPersonnages(lignes, exclus);
  const type = noms.length === 1 ? "Monologue" : noms.length === 2 ? "Duo" : noms.length >= 3 ? "Scène collective" : "";

  const mots = (texte.match(/\p{L}+/gu) || []).length;
  const minutes = Math.max(1, Math.round(mots / 120));
  const duree = mots >= 20 && !options.partiel && minutes <= 60 ? String(minutes) : "";

  return {
    titre,
    auteur,
    personnages: noms.join(", "),
    type,
    siecle: connu?.siecle ?? "",
    duree,
    format: devinerFormat(texte)
  };
}

/* ---------- Lecture du PDF dans le navigateur ---------- */

const PAGES_MAX = 40;

async function lirePdf(fichier) {
  const pdfjs = await import("./vendor/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("vendor/pdf.worker.min.mjs", document.baseURI).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) }).promise;
  try {
    const info = (await doc.getMetadata().catch(() => null))?.info ?? {};
    const pages = Math.min(doc.numPages, PAGES_MAX);
    let texte = "";
    for (let i = 1; i <= pages; i++) {
      const contenu = await (await doc.getPage(i)).getTextContent();
      let dernierY = null;
      for (const item of contenu.items) {
        if (typeof item.str !== "string") continue;
        // Retour à la ligne : signalé par pdf.js, ou déduit d'un changement de hauteur du texte.
        const y = item.transform?.[5];
        if (dernierY !== null && y !== undefined && Math.abs(y - dernierY) > 2 && !texte.endsWith("\n")) texte += "\n";
        texte += item.str;
        if (item.hasEOL) texte += "\n";
        if (y !== undefined) dernierY = y;
      }
      texte += "\n";
    }
    return { texte, meta: { titre: info.Title, auteur: info.Author }, partiel: doc.numPages > PAGES_MAX };
  } finally {
    doc.destroy();
  }
}

// Renvoie { texteTrouve, ...champs }. texteTrouve = false pour un PDF scanné (image sans texte).
async function analyserPdf(fichier) {
  const { texte, meta, partiel } = await lirePdf(fichier);
  if (texte.replace(/\s/g, "").length < 40) return { texteTrouve: false };
  return { texteTrouve: true, ...deviner(texte, fichier.name, meta, { partiel }) };
}

if (typeof module !== "undefined") module.exports = { deviner };
