export function renderBottomSheet(content = '') {
  return `
    <div class="bottom-sheet" id="bottom-sheet">
      <div class="bottom-sheet__overlay" data-action="close-sheet"></div>
      <div class="bottom-sheet__content">
        <div class="bottom-sheet__handle"></div>
        ${content}
      </div>
    </div>
  `;
}

export function openBottomSheet() {
  const sheet = document.getElementById('bottom-sheet');
  if (sheet) {
    sheet.classList.add('bottom-sheet--open');
    document.body.classList.add('no-scroll');
  }
}

export function closeBottomSheet() {
  const sheet = document.getElementById('bottom-sheet');
  if (sheet) {
    sheet.classList.remove('bottom-sheet--open');
    document.body.classList.remove('no-scroll');
  }
}
