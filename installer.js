// Fiche « Installe La Truculance » : explique comment ajouter le site à l'écran d'accueil.
// Utilise el() et icone() définis dans script.js.
(() => {
  const CLE = "la-truculance-installation";
  const REPORT_JOURS = 7;

  const dialogue = document.getElementById("installer");
  const etapes = document.getElementById("installer-etapes");
  const note = document.getElementById("installer-note");
  const boutonInstaller = document.getElementById("installer-action");
  const lien = document.getElementById("installer-lien");

  const ua = navigator.userAgent;
  const iOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const mobile = iOS || /android/i.test(ua);
  const dejaInstallee = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  let invite = null; // l'invite d'installation de Chrome / Edge / Android, quand elle existe

  function reporte() {
    try {
      const quand = Number(localStorage.getItem(CLE));
      return quand > 0 && Date.now() - quand < REPORT_JOURS * 864e5;
    } catch {
      return false;
    }
  }
  function reporter() {
    try { localStorage.setItem(CLE, String(Date.now())); } catch {}
  }

  const picto = (nom) => {
    const s = el("span", "picto");
    s.appendChild(icone(nom));
    return s;
  };
  const gras = (texte) => el("b", "", texte);
  const etape = (...morceaux) => {
    const li = el("li");
    const p = el("span");
    p.append(...morceaux);
    li.appendChild(p);
    return li;
  };

  function remplir() {
    etapes.replaceChildren();
    boutonInstaller.hidden = !invite;

    if (invite) {
      note.textContent = "L’installation ne prend que quelques secondes.";
    } else if (iOS) {
      etapes.append(
        etape("Touche ", picto("menu"), " dans la barre d’adresse."),
        etape("Touche ", picto("partager"), " ", gras("Partager"), "."),
        etape("Touche ", gras("Plus…"), " si tu le vois."),
        etape("Touche ", picto("ecran"), " ", gras("Sur l’écran d’accueil"), "."),
        etape("Touche ", gras("Ajouter"), ".")
      );
      note.textContent =
        "Ouvre ensuite La Truculance depuis ton écran d’accueil. Sur un iPhone plus ancien, le bouton Partager est en bas de l’écran. Si tu ne vois pas ces options, ouvre le site dans Safari (pas dans Instagram, Snapchat ou WhatsApp).";
    } else {
      etapes.append(
        etape("Touche ", picto("points"), " dans ton navigateur."),
        etape("Touche ", gras("Installer l’application"), " ou ", gras("Ajouter à l’écran d’accueil"), "."),
        etape("Confirme avec ", gras("Installer"), ".")
      );
      note.textContent = "Ouvre ensuite La Truculance depuis ton écran d’accueil.";
    }
  }

  function ouvrir() {
    remplir();
    if (!dialogue.open) ouvrirFeuille(dialogue);
  }

  function majLien() {
    lien.hidden = dejaInstallee() || !(mobile || invite);
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    invite = e;
    majLien();
    if (dialogue.open) remplir();
  });
  window.addEventListener("appinstalled", () => {
    invite = null;
    if (dialogue.open) dialogue.close();
    lien.hidden = true;
  });

  boutonInstaller.addEventListener("click", async () => {
    if (!invite) return;
    invite.prompt();
    await invite.userChoice.catch(() => {});
    invite = null;
    dialogue.close();
  });

  document.getElementById("installer-plus-tard").addEventListener("click", () => dialogue.close());
  document.getElementById("fermer-installer").addEventListener("click", () => dialogue.close());
  fermerAuClicDehors(dialogue);
  dialogue.addEventListener("close", reporter);
  lien.addEventListener("click", ouvrir);

  majLien();

  // Apparition automatique : sur mobile, hors app installée, une fois le prénom saisi.
  function planifier() {
    if (!mobile || dejaInstallee() || reporte()) return;
    setTimeout(() => {
      if (!document.querySelector("dialog[open]")) ouvrir();
    }, 1200);
  }
  // La fenêtre d'entrée s'ouvre un peu plus tard (après le chargement) : on l'attend aussi.
  if (elIdentite.open || accesRequis()) elIdentite.addEventListener("close", planifier, { once: true });
  else planifier();
})();
