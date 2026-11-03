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

let textes = [];
let premierAffichage = true;
const filtres = {};
const puces = {}; // clé du groupe -> [{ valeur, bouton }]

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
    .map((l) => {
      const t = {};
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
  filtres[cle] = filtres[cle] === valeur ? "" : valeur;
  afficher();
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
  elRapide.querySelectorAll(".chip:not(.chip-filtres)").forEach((c) => c.remove());
  for (const cle of Object.keys(puces)) delete puces[cle];

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
}

function reinitialiser() {
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
    pied.appendChild(a);
  } else {
    pied.appendChild(el("span", "indispo", "PDF non disponible"));
  }
  carte.appendChild(pied);

  if (t.prenom) carte.appendChild(el("p", "prenom", `Proposé par ${t.prenom}`));
  return carte;
}

function correspond(t) {
  return Object.entries(filtres).every(([cle, v]) => !v || t[cle] === v);
}

function etatVide() {
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
      const actif = filtres[cle] === valeur;
      bouton.classList.toggle("actif", actif);
      bouton.setAttribute("aria-pressed", String(actif));
    }
  }

  const actifs = Object.values(filtres).filter(Boolean).length;
  elNbFiltres.textContent = actifs;
  elNbFiltres.hidden = actifs === 0;
  elReset.disabled = !(actifs || recherche);
  elAppliquer.textContent = nombre ? `Voir ${nombre} texte${nombre > 1 ? "s" : ""}` : "Aucun texte";
}

function afficher() {
  const q = normaliser(elRecherche.value);
  const resultats = textes.filter(
    (t) => correspond(t) && normaliser(`${t.titre} ${t.auteur} ${t.personnages}`).includes(q)
  );

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

function message(titre, texte, reessayer = false) {
  const bloc = el("div", "vide");
  bloc.append(el("strong", "", titre), el("p", "", texte));
  if (reessayer) {
    const b = el("button", "secondaire", "Réessayer");
    b.type = "button";
    b.addEventListener("click", demarrer);
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

document.getElementById("ouvrir-filtres").addEventListener("click", () => elFiltres.showModal());
document.getElementById("fermer-filtres").addEventListener("click", () => elFiltres.close());
elAppliquer.addEventListener("click", () => elFiltres.close());
fermerAuClicDehors(elFiltres);

async function demarrer() {
  if (!CONFIG.LIEN_CSV) {
    message("Bientôt !", "Le catalogue n’est pas encore disponible.");
    return;
  }
  squelette();
  try {
    const reponse = await fetch(CONFIG.LIEN_CSV);
    if (!reponse.ok) throw new Error(reponse.status);
    textes = lireTextes(await reponse.text());
  } catch {
    message("Oups.", "Impossible de charger les textes. Vérifie ta connexion.", true);
    return;
  }
  if (textes.length === 0) {
    message("C’est vide.", "Aucun texte pour l’instant. Sois le premier à en proposer un !");
    return;
  }
  creerGroupes();
  afficher();
}

demarrer();
