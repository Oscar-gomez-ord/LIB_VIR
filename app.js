window.addEventListener('load', async () => {
  loadLocal();

  const barcodeInput = document.getElementById('barcode-input');
  if (barcodeInput) {
    barcodeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { addByBarcode(e.target.value.trim()); e.target.value = ''; }
    });
  }

  const discountInput = document.getElementById('discount-input');
  if (discountInput) discountInput.addEventListener('input', updateCartUI);

  setDefaultDates();

  if (!state.config.scriptUrl) {
    showSetup();
  } else {
    document.getElementById('setup-page').style.display  = 'none';
    document.getElementById('main-app').style.display    = 'none';
    document.getElementById('lock-screen').style.display = 'flex';

    const numpad = document.querySelector('.numpad');
    if (numpad) numpad.style.opacity = '0.5';

    await syncAll();

    if (numpad) numpad.style.opacity = '1';

    if (state.users.length === 0) {
      document.getElementById('lock-screen').style.display = 'none';
      state.isFirstSetup = true;
      openUserModal(null, true);
    }
  }
  // ← UNA SOLA llave de cierre del if/else
});
// ← UNA SOLA vez
