const TAILLE_MAX_PDF = 5 * 1024 * 1024;
const CLE_ECHEANCE = "la-truculance-echeance";

const elDialogue = document.getElementById("dialogue");
const elForm = document.getElementById("formulaire");
const elStatut = document.getElementById("statut");
const elEnvoyer = document.getElementById("envoyer");
const elBoutonProposer = document.getElementById("proposer");
const elAutoInfo = document.getElementById("auto-info");

// Chaque liste commence par « Choisir… » : sans ça, un élève pressé enverrait la 1re valeur sans s'en rendre compte.
function remplirSelects() {
  const listes = {
    "f-format": CONFIG.FORMATS,
    "f-echeance": CONFIG.ECHEANCES,
    "f-type": CONFIG.TYPES,
    "f-siecle": CONFIG.SIECLES,
    "f-registre": CONFIG.REGISTRES
  };
  for (const [id, valeurs] of Object.entries(listes)) {
    const invite = new Option("Choisir…", "", true, true);
    invite.disabled = true;
    document.getElementById(id).replaceChildren(invite, ...valeurs.map((v) => new Option(v, v)));
  }
}

const lireBase64 = (fichier) =>
  new Promise((ok, ko) => {
    const lecteur = new FileReader();
    lecteur.onload = () => ok(String(lecteur.result).split(",")[1]);
    lecteur.onerror = ko;
    lecteur.readAsDataURL(fichier);
  });

function statut(texte, erreur = false) {
  elStatut.textContent = texte;
  elStatut.className = erreur ? "erreur" : "";
}

/* ---------- Remplissage automatique depuis le PDF ---------- */

const CHAMPS_AUTO = { format: "format", titre: "titre", auteur: "auteur", personnages: "personnages", type: "type", siecle: "siècle", duree: "durée" };
let analyseNumero = 0;

function infoAuto(texte, erreur = false) {
  elAutoInfo.textContent = texte;
  elAutoInfo.className = erreur ? "auto-info erreur" : "auto-info";
}

// Vide les champs remplis automatiquement et jamais retouchés par l'élève.
function effacerAuto() {
  for (const champ of elForm.querySelectorAll(".auto")) {
    champ.value = "";
    champ.classList.remove("auto");
  }
}

async function remplirDepuisPdf(fichier) {
  const numero = ++analyseNumero;
  effacerAuto();
  infoAuto("");
  if (!fichier) return;
  if (fichier.type !== "application/pdf" || fichier.size > TAILLE_MAX_PDF) {
    infoAuto("Le fichier doit être un PDF de 5 Mo maximum.", true);
    return;
  }

  infoAuto("Lecture du PDF…");
  let resultat;
  try {
    resultat = await analyserPdf(fichier);
  } catch {
    if (numero === analyseNumero) infoAuto("Je n’ai pas pu lire ce PDF automatiquement : remplis les champs à la main.");
    return;
  }
  if (numero !== analyseNumero) return; // l'élève a choisi un autre fichier entre-temps

  if (!resultat.texteTrouve) {
    infoAuto("Ce PDF ne contient pas de texte (c’est une image ?) : remplis les champs à la main.");
    return;
  }

  const remplis = [];
  for (const [nom, libelle] of Object.entries(CHAMPS_AUTO)) {
    const champ = elForm.elements[nom];
    const valeur = resultat[nom];
    if (!valeur || champ.value) continue; // on n'écrase jamais ce que l'élève a déjà tapé
    champ.value = valeur;
    if (champ.value !== valeur) { // valeur absente de la liste déroulante
      champ.value = "";
      continue;
    }
    champ.classList.add("auto");
    remplis.push(libelle);
  }
  infoAuto(
    remplis.length
      ? `Rempli depuis ton PDF : ${remplis.join(", ")}. Vérifie avant d’envoyer.`
      : "Je n’ai rien pu deviner : remplis les champs à la main."
  );
}

/* ---------- Envoi ---------- */

async function envoyer(e) {
  e.preventDefault();
  if (!lienSur(CONFIG.LIEN_ENVOI)) {
    statut("Les propositions ne sont pas encore activées.", true);
    return;
  }
  const champs = elForm.elements;
  const fichier = champs.pdf.files[0];

  if (fichier && (fichier.type !== "application/pdf" || fichier.size > TAILLE_MAX_PDF)) {
    statut("Le fichier doit être un PDF de 5 Mo maximum.", true);
    return;
  }
  if (!fichier && !lienSur(champs.lien.value)) {
    statut("Ajoute un PDF ou un lien vers le texte.", true);
    return;
  }

  const donnees = {};
  for (const nom of ["prenom", "format", "titre", "auteur", "personnages", "echeance", "type", "siecle", "registre", "duree", "lien", "code", "site"]) {
    donnees[nom] = champs[nom].value.trim();
  }

  elEnvoyer.disabled = true;
  statut("Envoi en cours…");
  try {
    if (fichier) donnees.pdf = { nom: fichier.name, donnees: await lireBase64(fichier) };
    const reponse = await fetch(CONFIG.LIEN_ENVOI, { method: "POST", body: JSON.stringify(donnees) });
    const resultat = await reponse.json();
    if (!resultat.ok) {
      statut(resultat.erreur || "Envoi impossible. Réessaie plus tard.", true);
      return;
    }

    // Le code a été accepté : on le garde, ainsi que l'échéance, pour ne pas les retaper la prochaine fois.
    ecrireMemoire(CLE_CODE, donnees.code);
    ecrireMemoire(CLE_ECHEANCE, donnees.echeance);
    statut("Merci ! Ton texte apparaîtra après validation.");
    elForm.reset();
    effacerAuto();
    infoAuto("");
    setTimeout(() => elDialogue.close(), 2500);
  } catch {
    // Réseau coupé ou réponse illisible : le message du navigateur ("Failed to fetch") n'aiderait personne.
    statut("Envoi impossible. Vérifie ta connexion et réessaie.", true);
  } finally {
    elEnvoyer.disabled = false;
  }
}

function ouvrirFormulaire() {
  statut("");
  infoAuto("");
  // Le code a déjà été tapé à l'entrée du site : on ne le redemande pas.
  const code = elForm.elements.code;
  if (!code.value) code.value = codeEnregistre();
  code.closest("label").hidden = Boolean(codeEnregistre());
  const echeance = elForm.elements.echeance;
  if (!echeance.value && [...echeance.options].some((o) => o.value === lireMemoire(CLE_ECHEANCE))) echeance.value = lireMemoire(CLE_ECHEANCE);
  elDialogue.showModal();
}

remplirSelects();
// Deux façons de proposer un texte : le formulaire du site (LIEN_ENVOI) ou, à défaut, un Google Form (LIEN_FORMULAIRE).
elBoutonProposer.hidden = !(lienSur(CONFIG.LIEN_ENVOI) || lienSur(CONFIG.LIEN_FORMULAIRE));
elBoutonProposer.addEventListener("click", () => {
  if (!lienSur(CONFIG.LIEN_ENVOI)) {
    window.open(lienSur(CONFIG.LIEN_FORMULAIRE), "_blank", "noopener");
    return;
  }
  ouvrirFormulaire();
});
document.getElementById("annuler").addEventListener("click", () => elDialogue.close());
elForm.addEventListener("submit", envoyer);
elForm.elements.pdf.addEventListener("change", (e) => remplirDepuisPdf(e.target.files[0]));
// Dès que l'élève retouche un champ rempli automatiquement, il n'est plus considéré comme « automatique ».
elForm.addEventListener("input", (e) => e.target.classList?.remove("auto"));
