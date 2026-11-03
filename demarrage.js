// Dernier script chargé : tout le reste est prêt.
if ("serviceWorker" in navigator) {
  // Au tout premier chargement il n'y a pas encore de service worker : pas de message dans ce cas.
  const avaitUneVersion = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.register("sw.js").then((reg) => {
    // Une app installée reste souvent ouverte en arrière-plan : on vérifie les mises à jour à chaque retour.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) reg.update().catch(() => {});
    });
  }).catch(() => {});

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (avaitUneVersion) document.getElementById("maj").hidden = false;
  });
  document.getElementById("maj-action").addEventListener("click", () => location.reload());
}
demarrer();
