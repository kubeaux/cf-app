const GROUPES = [
  { cle: "format", titre: "Format" },
  { cle: "echeance", titre: "Échéance" },
  { cle: "type", titre: "Type de scène" },
  { cle: "siecle", titre: "Siècle" },
  { cle: "registre", titre: "Registre" },
  { cle: "tranche", titre: "Durée" }
];
// Ces groupes sont aussi affichés en puces rapides sous la barre de recherche.
const GROUPES_RAPIDES = ["format", "type"];

const elListe = document.getElementById("liste");
const elCompteur = document.getElementById("compteur");
const elRecherche = document.getElementById("recherche");
const elGroupes = document.getElementById("groupes");
const elRapide = document.getElementById("rapide");
const elReset = document.getElementById("reinitialiser");
const elAppliquer = document.getElementById("appliquer");
const elNbFiltres = document.getElementById("nb-filtres");
const elFiltres = document.getElementById("filtres-dialog");
const elChipFavoris = document.getElementById("chip-favoris");
const elNbFavoris = document.getElementById("nb-favoris");
const elToutVoir = document.getElementById("tout-voir");

let textes = [];
let premierAffichage = true;
const filtres = {};
const puces = {}; // clé du groupe -> [{ valeur, bouton }]

// Mémoire de l'appareil (jamais sur un serveur). Les accès au stockage peuvent échouer en navigation privée.
const CLE_CODE = "la-truculance-code";
const CLE_CATALOGUE = "la-truculance-catalogue";
const lireMemoire = (cle) => { try { return localStorage.getItem(cle) || ""; } catch { return ""; } };
const ecrireMemoire = (cle, valeur) => { try { localStorage.setItem(cle, valeur); } catch {} };
const oublierMemoire = (cle) => { try { localStorage.removeItem(cle); } catch {} };
const codeEnregistre = () => lireMemoire(CLE_CODE);
const catalogueProtege = () => Boolean(CONFIG.CODE_REQUIS);

// Préférences de l'appareil : dernière échéance choisie, tri, textes gardés dans « Mon répertoire ».
const CLE_ECHEANCE = "la-truculance-echeance";
const CLE_TRI = "la-truculance-tri";
const CLE_FAVORIS = "la-truculance-favoris";

const OPTIONS_TRI = [["recents", "Récents"], ["duree", "Durée"], ["az", "A → Z"]];
let tri = OPTIONS_TRI.some(([v]) => v === lireMemoire(CLE_TRI)) ? lireMemoire(CLE_TRI) : "recents";

function lireFavoris() {
  try {
    const liste = JSON.parse(lireMemoire(CLE_FAVORIS) || "[]");
    return new Set(Array.isArray(liste) ? liste.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}
const favoris = lireFavoris();
let soloFavoris = false; // true = on n'affiche que « Mon répertoire »

class ErreurCode extends Error {}

const normaliser = (s) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const reduireMouvement = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function el(tag, classe, texte) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texte !== undefined) e.textContent = texte;
  return e;
}

// Les icônes viennent du « sprite » en haut de index.html.
function icone(nom) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "ico");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${nom}`);
  svg.appendChild(use);
  return svg;
}

// Ouvre une feuille, avec deux filets de sécurité (la feuille resterait invisible, et le fond flouté bloquerait toute la page) :
//  1. si l'animation d'entrée reste bloquée au départ, on la termine d'office ;
//  2. si la feuille est ouverte mais invisible (masquée par un bloqueur de pop-ups, par exemple), on la referme.
function feuilleVisible(dialogue) {
  const style = getComputedStyle(dialogue);
  const r = dialogue.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.05 && r.height > 40 && r.top < innerHeight - 40;
}

function ouvrirFeuille(dialogue) {
  dialogue.showModal();
  setTimeout(() => {
    if (!dialogue.open) return;
    if (dialogue.getAnimations) {
      for (const animation of dialogue.getAnimations()) {
        try { animation.finish(); } catch {}
      }
    }
    setTimeout(() => {
      if (dialogue.open && !feuilleVisible(dialogue)) dialogue.close();
    }, 200);
  }, 700);
}

function fermerAuClicDehors(dialogue) {
  dialogue.addEventListener("click", (e) => {
    if (e.target === dialogue) dialogue.close();
  });
}

function parserCSV(source) {
  const lignes = [];
  let ligne = [];
  let champ = "";
  let guillemets = false;

  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (guillemets) {
      if (c === '"' && source[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ",") { ligne.push(champ); champ = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = "";
    } else champ += c;
  }
  if (champ !== "" || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

function tranche(duree) {
  const d = parseFloat(String(duree).replace(",", "."));
  if (Number.isNaN(d)) return "";
  if (d < 3) return "Moins de 3 min";
  if (d <= 5) return "3 à 5 min";
  return "Plus de 5 min";
}

function lireTextes(csv) {
  const [entetes = [], ...lignes] = parserCSV(csv.replace(/^﻿/, ""));
  const normalises = entetes.map(normaliser);
  const index = {};
  for (const [champ, nom] of Object.entries(CONFIG.COLONNES)) {
    index[champ] = normalises.indexOf(normaliser(nom));
  }

  return lignes
    .map((l, i) => {
      const t = { ordre: i }; // rang dans le Sheet : sert au tri « Récents »
      for (const champ of Object.keys(index)) {
        t[champ] = index[champ] >= 0 ? (l[index[champ]] ?? "").trim() : "";
      }
      t.tranche = tranche(t.duree);
      return t;
    })
    .filter((t) => t.titre && (index.valide < 0 || normaliser(t.valide) === "oui"));
}

function romain(s) {
  const m = String(s).toUpperCase().match(/^[IVXL]+/);
  if (!m) return 99;
  const val = { I: 1, V: 5, X: 10, L: 50 };
  let total = 0;
  for (let i = 0; i < m[0].length; i++) {
    const v = val[m[0][i]];
    total += v < (val[m[0][i + 1]] || 0) ? -v : v;
  }
  return total;
}

function valeursTriees(cle) {
  const valeurs = [...new Set(textes.map((t) => t[cle]).filter(Boolean))];
  if (cle === "siecle") return valeurs.sort((a, b) => romain(a) - romain(b));
  if (cle === "tranche") return ["Moins de 3 min", "3 à 5 min", "Plus de 5 min"].filter((v) => valeurs.includes(v));
  return valeurs.sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
}

/* ---------- Filtres ---------- */

function choisir(cle, valeur) {
  if (cle === "tri") {
    tri = valeur;
    ecrireMemoire(CLE_TRI, valeur);
  } else {
    filtres[cle] = filtres[cle] === valeur ? "" : valeur;
    // On retient l'échéance : elle sera déjà choisie à la prochaine visite (et dans le formulaire « Proposer »).
    if (cle === "echeance") ecrireMemoire(CLE_ECHEANCE, filtres[cle]);
  }
  afficher();
}

function trier(liste) {
  const copie = [...liste];
  const parTitre = (a, b) => a.titre.localeCompare(b.titre, "fr", { sensitivity: "base" });
  if (tri === "az") return copie.sort(parTitre);
  if (tri === "duree") {
    const minutes = (t) => {
      const n = parseFloat(String(t.duree).replace(",", "."));
      return Number.isNaN(n) ? Infinity : n; // les textes sans durée vont à la fin
    };
    return copie.sort((a, b) => minutes(a) - minutes(b) || parTitre(a, b));
  }
  return copie.sort((a, b) => b.ordre - a.ordre); // récents : les dernières lignes du Sheet d'abord
}

/* ---------- Mon répertoire ---------- */

const cleTexte = (t) => normaliser(`${t.titre}|${t.auteur}|${t.personnages}`);
const nbFavoris = () => textes.filter((t) => favoris.has(cleTexte(t))).length;

function majChipFavoris() {
  const n = nbFavoris();
  elNbFavoris.textContent = n;
  elNbFavoris.hidden = n === 0;
  elChipFavoris.classList.toggle("actif", soloFavoris);
  elChipFavoris.setAttribute("aria-pressed", String(soloFavoris));
}

function basculerFavori(t, majBouton) {
  const cle = cleTexte(t);
  if (favoris.has(cle)) favoris.delete(cle);
  else favoris.add(cle);
  ecrireMemoire(CLE_FAVORIS, JSON.stringify([...favoris]));
  majBouton();
  if (soloFavoris) {
    // La carte doit disparaître de la liste ; on garde la position de défilement.
    const y = scrollY;
    afficher();
    scrollTo(0, y);
  } else {
    majChipFavoris();
  }
}

function creerPuce(cle, valeur, libelle) {
  const b = el("button", "chip", libelle);
  b.type = "button";
  b.addEventListener("click", () => choisir(cle, valeur));
  (puces[cle] ||= []).push({ valeur, bouton: b });
  return b;
}

function creerGroupes() {
  elGroupes.replaceChildren();
  elRapide.querySelectorAll(".chip:not(.chip-filtres):not(.chip-fixe)").forEach((c) => c.remove());
  for (const cle of Object.keys(puces)) delete puces[cle];

  const groupeTri = el("div", "groupe");
  const chipsTri = el("div", "chips");
  for (const [valeur, libelle] of OPTIONS_TRI) chipsTri.appendChild(creerPuce("tri", valeur, libelle));
  groupeTri.append(el("h3", "", "Trier par"), chipsTri);
  elGroupes.appendChild(groupeTri);

  const groupes = [];
  for (const { cle, titre } of GROUPES) {
    const valeurs = valeursTriees(cle);
    if (valeurs.length < 2) continue; // un filtre à une seule valeur ne sert à rien
    groupes.push({ cle, titre, options: [["", "Tous"], ...valeurs.map((v) => [v, v])] });
  }

  for (const { cle, titre, options } of groupes) {
    filtres[cle] = "";

    const groupe = el("div", "groupe");
    const chips = el("div", "chips");
    for (const [valeur, libelle] of options) chips.appendChild(creerPuce(cle, valeur, libelle));
    groupe.append(el("h3", "", titre), chips);
    elGroupes.appendChild(groupe);

    if (GROUPES_RAPIDES.includes(cle)) {
      for (const [valeur, libelle] of options) {
        if (valeur) elRapide.appendChild(creerPuce(cle, valeur, libelle));
      }
    }
  }

  // Retour de l'élève : on rouvre directement sur son échéance (bouton « Tout voir » pour l'enlever).
  const derniere = lireMemoire(CLE_ECHEANCE);
  if ("echeance" in filtres && derniere && valeursTriees("echeance").includes(derniere)) filtres.echeance = derniere;
}

function reinitialiser() {
  soloFavoris = false;
  elRecherche.value = "";
  for (const cle of Object.keys(filtres)) filtres[cle] = "";
  afficher();
}

/* ---------- Cartes ---------- */

function lienSur(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

// Pour les liens du catalogue : accepte aussi un chemin relatif (ex. « pdf/mon-texte.pdf »).
function lienTexte(url) {
  if (!url) return "";
  try {
    return lienSur(new URL(url, location.href).href);
  } catch {
    return "";
  }
}

function creerCarte(t, i) {
  const carte = el("article", premierAffichage ? "carte entree" : "carte");
  carte.style.setProperty("--i", Math.min(i, 7));

  const haut = el("div", "carte-haut");
  haut.appendChild(el("span", "pastille", t.echeance || "Texte"));
  if (t.duree) haut.appendChild(el("span", "duree", `${t.duree} min`));
  carte.append(haut, el("h2", "", t.titre));

  const signature = [t.auteur, t.siecle && `${t.siecle} siècle`].filter(Boolean).join(" · ");
  if (signature) carte.appendChild(el("p", "auteur", signature));

  if (t.personnages) carte.append(el("p", "etiquette", "Personnages"), el("p", "perso", t.personnages));

  const valeursTags = [t.format, t.type, t.registre].filter(Boolean);
  if (valeursTags.length) {
    const tags = el("div", "tags");
    for (const v of valeursTags) tags.appendChild(el("span", "tag", v));
    carte.appendChild(tags);
  }

  const pied = el("div", "carte-pied");
  const href = lienTexte(t.lien);
  if (href) {
    const a = el("a", "lire");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.append("Lire le texte", icone("fleche"));
    // Un PDF du site ou de notre Drive s'ouvre dans l'appli (lecteur.js). Le lien reste là en secours.
    const source = Lecteur.sourcePdf(href);
    if (source && (source.type === "local" || catalogueProtege())) {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        Lecteur.ouvrir({ titre: t.titre, lien: href, code: codeEnregistre() });
      });
    }
    pied.appendChild(a);
  } else {
    pied.appendChild(el("span", "indispo", "PDF non disponible"));
  }

  const fav = el("button", "fav");
  fav.type = "button";
  fav.setAttribute("aria-label", "Garder dans mon répertoire");
  fav.appendChild(icone("coeur"));
  const majFav = () => {
    const actif = favoris.has(cleTexte(t));
    fav.classList.toggle("actif", actif);
    fav.setAttribute("aria-pressed", String(actif));
  };
  majFav();
  fav.addEventListener("click", () => basculerFavori(t, majFav));
  pied.appendChild(fav);
  carte.appendChild(pied);

  if (t.prenom) carte.appendChild(el("p", "prenom", `Proposé par ${t.prenom}`));
  return carte;
}

function correspond(t) {
  return (!soloFavoris || favoris.has(cleTexte(t))) && Object.entries(filtres).every(([cle, v]) => !v || t[cle] === v);
}

function etatVide() {
  if (soloFavoris && nbFavoris() === 0) {
    const bloc = el("div", "vide");
    bloc.append(el("strong", "", "Ton répertoire est vide."), el("p", "", "Touche le cœur sur un texte pour le garder ici."));
    const b = el("button", "secondaire", "Voir tous les textes");
    b.type = "button";
    b.addEventListener("click", () => { soloFavoris = false; afficher(); });
    bloc.appendChild(b);
    return bloc;
  }
  const bloc = el("div", "vide");
  bloc.append(el("strong", "", "Rien ne correspond."), el("p", "", "Essaie avec moins de filtres ou un autre mot."));
  const b = el("button", "secondaire", "Réinitialiser");
  b.type = "button";
  b.addEventListener("click", reinitialiser);
  bloc.appendChild(b);
  return bloc;
}

function majInterface(nombre, recherche) {
  for (const [cle, liste] of Object.entries(puces)) {
    for (const { valeur, bouton } of liste) {
      const actif = (cle === "tri" ? tri : filtres[cle]) === valeur;
      bouton.classList.toggle("actif", actif);
      bouton.setAttribute("aria-pressed", String(actif));
    }
  }

  const actifs = Object.values(filtres).filter(Boolean).length;
  elNbFiltres.textContent = actifs;
  elNbFiltres.hidden = actifs === 0;
  elReset.disabled = !(actifs || recherche || soloFavoris);
  elToutVoir.hidden = !filtres.echeance;
  elToutVoir.textContent = `${filtres.echeance || ""} · Tout voir`;
  majChipFavoris();
  elAppliquer.textContent = nombre ? `Voir ${nombre} texte${nombre > 1 ? "s" : ""}` : "Aucun texte";
}

function afficher() {
  const q = normaliser(elRecherche.value);
  const resultats = trier(textes.filter(
    (t) => correspond(t) && normaliser(`${t.titre} ${t.auteur} ${t.personnages}`).includes(q)
  ));

  elListe.replaceChildren(...(resultats.length ? resultats.map(creerCarte) : [etatVide()]));
  elCompteur.textContent = resultats.length ? `${resultats.length} texte${resultats.length > 1 ? "s" : ""}` : "";
  majInterface(resultats.length, q);
  premierAffichage = false;
}

/* ---------- États de chargement ---------- */

function squelette() {
  const cartes = [0, 1, 2].map(() => {
    const c = el("article", "carte sq");
    c.append(el("i"), el("i"), el("i"));
    return c;
  });
  elListe.replaceChildren(...cartes);
  elCompteur.textContent = "";
}

function message(titre, texte, action) {
  const bloc = el("div", "vide");
  bloc.append(el("strong", "", titre), el("p", "", texte));
  if (action) {
    const b = el("button", "secondaire", action.libelle);
    b.type = "button";
    b.addEventListener("click", action.fn);
    bloc.appendChild(b);
  }
  elListe.replaceChildren(bloc);
  elCompteur.textContent = "";
}

/* ---------- Démarrage ---------- */

// La barre de recherche prend l'effet « verre » seulement quand elle est collée en haut de l'écran.
const elOutils = document.querySelector(".outils");
let majCollePrevue = false;
function majColle() {
  majCollePrevue = false;
  const haut = parseFloat(getComputedStyle(elOutils).top) || 0;
  elOutils.classList.toggle("colle", elOutils.getBoundingClientRect().top <= haut + 0.5);
}
addEventListener("scroll", () => {
  if (majCollePrevue) return;
  majCollePrevue = true;
  requestAnimationFrame(majColle);
}, { passive: true });
majColle();

elRecherche.addEventListener("input", afficher);
elReset.addEventListener("click", reinitialiser);
elChipFavoris.addEventListener("click", () => { soloFavoris = !soloFavoris; afficher(); });
elToutVoir.addEventListener("click", () => choisir("echeance", filtres.echeance));

document.getElementById("ouvrir-filtres").addEventListener("click", () => ouvrirFeuille(elFiltres));
document.getElementById("fermer-filtres").addEventListener("click", () => elFiltres.close());
elAppliquer.addEventListener("click", () => elFiltres.close());
fermerAuClicDehors(elFiltres);

// Renvoie le texte CSV du catalogue.
// Protégé : le code part dans le corps d'un POST (jamais dans l'adresse) et c'est le serveur qui le vérifie.
async function chargerCsv() {
  if (!catalogueProtege()) {
    const reponse = await fetch(CONFIG.LIEN_CSV);
    if (!reponse.ok) throw new Error(reponse.status);
    return reponse.text();
  }
  const reponse = await fetch(CONFIG.LIEN_CSV, { method: "POST", body: JSON.stringify({ action: "lire", code: codeEnregistre() }) });
  const resultat = await reponse.json();
  if (resultat.ok) {
    ecrireMemoire(CLE_CATALOGUE, resultat.csv); // copie pour le hors-ligne
    return resultat.csv;
  }
  if (resultat.code) throw new ErreurCode(resultat.erreur);
  throw new Error(resultat.erreur || "Réponse inattendue");
}

async function demarrer() {
  if (!CONFIG.LIEN_CSV) {
    message("Bientôt !", "Le catalogue n’est pas encore disponible.");
    return;
  }
  if (catalogueProtege() && !codeEnregistre()) {
    message("Réservé à la classe.", "Entre le code de la classe pour voir les textes.", { libelle: "Entrer le code", fn: () => ouvrirAcces() });
    return;
  }

  squelette();
  const reessayer = { libelle: "Réessayer", fn: demarrer };
  let csv;
  try {
    csv = await chargerCsv();
  } catch (erreur) {
    if (erreur instanceof ErreurCode) {
      oublierMemoire(CLE_CODE);
      oublierMemoire(CLE_CATALOGUE);
      message("Réservé à la classe.", "Entre le code de la classe pour voir les textes.", { libelle: "Entrer le code", fn: () => ouvrirAcces() });
      ouvrirAcces(erreur.message);
      return;
    }
    // Pas de connexion : on montre la dernière copie du catalogue si on en a une.
    csv = catalogueProtege() ? lireMemoire(CLE_CATALOGUE) : "";
    if (!csv) {
      message("Oups.", "Impossible de charger les textes. Vérifie ta connexion.", reessayer);
      return;
    }
  }

  textes = lireTextes(csv);
  if (textes.length === 0) {
    message("C’est vide.", "Aucun texte pour l’instant. Sois le premier à en proposer un !");
    return;
  }
  creerGroupes();
  afficher();
}
