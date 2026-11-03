// Fenêtre d'entrée : prénom, et code de la classe quand le catalogue est protégé.
const CLE_PRENOM = "la-truculance-prenom";

const elIdentite = document.getElementById("identite");
const elFormIdentite = document.getElementById("form-identite");
const elPseudo = document.getElementById("pseudo");
const elCodeAcces = document.getElementById("code-acces");
const elAccesErreur = document.getElementById("acces-erreur");
const elNomUtilisateur = document.getElementById("nom-utilisateur");

const prenomEnregistre = () => lireMemoire(CLE_PRENOM);
const enregistrerPrenom = (prenom) => ecrireMemoire(CLE_PRENOM, prenom);

function afficherNom() {
  const prenom = prenomEnregistre();
  // Pastille ronde avec l'initiale ; un appui permet de changer de prénom ou de code.
  elNomUtilisateur.textContent = prenom ? Array.from(prenom)[0] : "";
  elNomUtilisateur.setAttribute("aria-label", `Connecté : ${prenom}. Modifier mon prénom ou mon code`);
  elNomUtilisateur.title = `Connecté : ${prenom}`;
  elNomUtilisateur.hidden = !prenom;
  const champ = document.getElementById("formulaire").elements.prenom;
  champ.defaultValue = prenom;
  champ.value = prenom;
}

// Ouvre la fenêtre d'entrée. « erreur » = message à afficher (ex. code refusé par le serveur).
function ouvrirAcces(erreur = "") {
  elPseudo.value = prenomEnregistre();
  elCodeAcces.value = "";
  elCodeAcces.closest("label").hidden = !catalogueProtege();
  elCodeAcces.required = catalogueProtege() && !codeEnregistre(); // un code déjà enregistré se garde si on laisse vide
  elCodeAcces.placeholder = codeEnregistre() ? "Laisse vide pour garder le même" : "";
  elAccesErreur.textContent = erreur;
  if (!elIdentite.open) ouvrirFeuille(elIdentite);
}

elFormIdentite.addEventListener("submit", (e) => {
  e.preventDefault();
  const prenom = elPseudo.value.trim();
  if (!prenom) return;
  enregistrerPrenom(prenom);
  afficherNom();

  const ancienCode = codeEnregistre();
  const nouveauCode = elCodeAcces.value.trim();
  if (catalogueProtege() && nouveauCode) ecrireMemoire(CLE_CODE, nouveauCode);
  elIdentite.close();

  // Nouveau code (ou catalogue jamais chargé) : on va chercher les textes.
  if (catalogueProtege() && (nouveauCode !== "" && nouveauCode !== ancienCode || textes.length === 0)) demarrer();
});

elNomUtilisateur.addEventListener("click", () => ouvrirAcces());

const accesRequis = () => !prenomEnregistre() || (catalogueProtege() && !codeEnregistre());

afficherNom();
if (accesRequis()) {
  // Sur iPhone, une fenêtre ouverte pendant le chargement pouvait rester invisible (seul le fond flouté apparaissait).
  // On attend donc que la page soit chargée et peinte.
  const ouvrir = () => requestAnimationFrame(() => requestAnimationFrame(() => ouvrirAcces()));
  if (document.readyState === "complete") ouvrir();
  else addEventListener("load", ouvrir, { once: true });
}
