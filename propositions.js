// « Mes propositions » : l'élève retrouve les textes qu'il a proposés et leur état (en attente, publié, refusé).
// L'appareil garde seulement l'identifiant reçu à l'envoi ; l'état vient du serveur (action « mes »).
// Utilise el(), ouvrirFeuille(), fermerAuClicDehors(), lireMemoire()… définis dans script.js.
(() => {
  const CLE = "la-truculance-propositions";
  const MAX = 30;
  const LIBELLES = {
    attente: "En attente de validation",
    valide: "Publié",
    refuse: "Refusé",
    retire: "Retiré du catalogue"
  };

  const chip = document.getElementById("chip-propositions");
  const badge = document.getElementById("nb-propositions");
  const dialogue = document.getElementById("propositions-dialog");
  const liste = document.getElementById("propositions-liste");
  const note = document.getElementById("propositions-note");

  function lire() {
    try {
      const l = JSON.parse(lireMemoire(CLE) || "[]");
      return Array.isArray(l) ? l.filter((x) => x && typeof x.id === "string" && typeof x.titre === "string") : [];
    } catch {
      return [];
    }
  }
  const ecrire = (l) => ecrireMemoire(CLE, JSON.stringify(l.slice(0, MAX)));

  // Un changement « à voir » = le serveur a publié ou refusé un texte depuis la dernière ouverture de la fenêtre.
  const nonVu = (l) => l.filter((p) => p.statut !== p.vu && (p.statut === "valide" || p.statut === "refuse")).length;

  function majChip() {
    const l = lire();
    chip.hidden = l.length === 0;
    const n = nonVu(l);
    badge.hidden = n === 0;
    badge.textContent = String(n);
  }

  // Appelé par envoi.js une fois la proposition acceptée.
  function ajouter({ id, titre, publie }) {
    if (!id) return;
    const statut = publie ? "valide" : "attente";
    ecrire([{ id, titre, statut, vu: statut }, ...lire().filter((p) => p.id !== id)]);
    majChip();
  }

  // Demande au serveur l'état de chaque proposition. Sans connexion, on garde ce qu'on savait.
  async function rafraichir() {
    const l = lire();
    if (!l.length || !lienSur(CONFIG.LIEN_ENVOI) || !codeEnregistre()) return l;
    try {
      const reponse = await fetch(CONFIG.LIEN_ENVOI, {
        method: "POST",
        body: JSON.stringify({ action: "mes", code: codeEnregistre(), ids: l.map((p) => p.id) })
      });
      const j = await reponse.json();
      if (!j.ok) return l;
      const etat = new Map(j.textes.map((t) => [t.id, t.statut]));
      // On relit juste avant d'écrire : une proposition a pu être ajoutée pendant l'attente de la réponse.
      const maj = lire().map((p) => (etat.has(p.id) ? { ...p, statut: etat.get(p.id) } : p));
      ecrire(maj);
      return maj;
    } catch {
      return l;
    }
  }

  function afficher(l) {
    liste.replaceChildren(...l.map((p) => {
      const li = el("li", "proposition");
      li.appendChild(el("span", "proposition-titre", p.titre));
      const etat = el("span", `etat etat-${p.statut}`, LIBELLES[p.statut] || "En attente de validation");
      if (p.statut !== p.vu && (p.statut === "valide" || p.statut === "refuse")) etat.classList.add("nouveau");
      li.appendChild(etat);
      return li;
    }));
    note.textContent = l.some((p) => p.statut === "attente")
      ? "Un texte en attente apparaît dans le catalogue dès qu’il est validé."
      : "";
  }

  async function ouvrir() {
    afficher(lire());
    ouvrirFeuille(dialogue);
    const maj = await rafraichir();
    afficher(maj);
    // Tout ce qui est affiché est maintenant « vu » : le badge repart à zéro.
    ecrire(lire().map((p) => ({ ...p, vu: p.statut })));
    majChip();
  }

  chip.addEventListener("click", ouvrir);
  document.getElementById("fermer-propositions").addEventListener("click", () => dialogue.close());
  fermerAuClicDehors(dialogue);

  window.Propositions = { ajouter };
  majChip();
  // Au démarrage : on regarde en silence si une proposition a été validée ou refusée entre-temps.
  rafraichir().then(majChip);
})();
