export function renderToastContainer() {
  return `<div id="toast-container" class="toast-container"></div>`;
}

export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Trigger CSS transition animation
  requestAnimationFrame(() => {
    toast.classList.add('toast--visible');
  });

  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    
    // Clean up element after fade-out transition
    toast.addEventListener('transitionend', () => {
      toast.remove();
    }, { once: true });
    
    // Fallback in case transitionend event doesn't fire
    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.remove();
      }
    }, 500);
  }, 3000);
}
