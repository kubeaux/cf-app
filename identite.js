const CLE_PRENOM = "la-truculance-prenom";

const elIdentite = document.getElementById("identite");
const elFormIdentite = document.getElementById("form-identite");
const elPseudo = document.getElementById("pseudo");
const elNomUtilisateur = document.getElementById("nom-utilisateur");

function prenomEnregistre() {
  try { return localStorage.getItem(CLE_PRENOM) || ""; } catch { return ""; }
}

function enregistrerPrenom(prenom) {
  try { localStorage.setItem(CLE_PRENOM, prenom); } catch {}
}

function afficherNom() {
  const prenom = prenomEnregistre();
  // Pastille ronde avec l'initiale ; un appui permet de changer de prénom.
  elNomUtilisateur.textContent = prenom ? Array.from(prenom)[0] : "";
  elNomUtilisateur.setAttribute("aria-label", `Connecté : ${prenom}. Changer de prénom`);
  elNomUtilisateur.title = `Connecté : ${prenom}`;
  elNomUtilisateur.hidden = !prenom;
  const champ = document.getElementById("formulaire").elements.prenom;
  champ.defaultValue = prenom;
  champ.value = prenom;
}

elFormIdentite.addEventListener("submit", (e) => {
  e.preventDefault();
  const prenom = elPseudo.value.trim();
  if (!prenom) return;
  enregistrerPrenom(prenom);
  afficherNom();
  elIdentite.close();
});

elNomUtilisateur.addEventListener("click", () => {
  elPseudo.value = prenomEnregistre();
  elIdentite.showModal();
});

afficherNom();
if (!prenomEnregistre()) elIdentite.showModal();
