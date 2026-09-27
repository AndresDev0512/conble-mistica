export function getCurrentRoute() {
  const hash = window.location.hash;
  if (hash === '#/esmeralda') {
    return { route: 'individual', person: 'esmeralda' };
  }
  if (hash === '#/andres') {
    return { route: 'individual', person: 'andres' };
  }
  return { route: 'dashboard', person: null };
}

export function navigate(hash) {
  window.location.hash = hash;
}

export function initRouter(renderFn) {
  const handleRouteChange = () => {
    const routeObj = getCurrentRoute();
    const content = document.getElementById('app-content');

    if (content) {
      content.classList.remove('page-enter');
      content.classList.add('page-exit');

      setTimeout(() => {
        renderFn(routeObj);
        content.classList.remove('page-exit');
        content.classList.add('page-enter');

        setTimeout(() => {
          content.classList.remove('page-enter');
        }, 300);
      }, 150);
    } else {
      renderFn(routeObj);
    }
  };

  window.addEventListener('hashchange', handleRouteChange);

  // Initial render (no animation)
  renderFn(getCurrentRoute());
}
