// public/submission.js
// Submission and cooldown management for the allocation system

// Submission state management
let isSubmitting = false;
let lastSubmitTime = 0;
const SUBMIT_DEBOUNCE_MS = 15 * 1000; // 15 seconds debounce

/**
 * Check if submission is too recent based on localStorage
 * This provides persistent cooldown across page refreshes
 */
function isSubmissionTooRecent() {
  const lastSubmit = localStorage.getItem(window.stateModule.LAST_SUBMIT_TIME_KEY);
  if (!lastSubmit) return false;
  
  const lastSubmitTimestamp = parseInt(lastSubmit, 10);
  const now = Date.now();
  const cooldownMs = 15 * 1000; // 15 seconds
  
  return (now - lastSubmitTimestamp) < cooldownMs;
}

/**
 * Get remaining cooldown time in seconds
 */
function getRemainingCooldownSeconds() {
  const lastSubmit = localStorage.getItem(window.stateModule.LAST_SUBMIT_TIME_KEY);
  if (!lastSubmit) return 0;
  
  const lastSubmitTimestamp = parseInt(lastSubmit, 10);
  const now = Date.now();
  const cooldownMs = 15 * 1000; // 15 seconds
  const remaining = Math.ceil((cooldownMs - (now - lastSubmitTimestamp)) / 1000);
  
  return Math.max(0, remaining);
}

/**
 * Set last submission time in localStorage
 */
function setLastSubmissionTime() {
  localStorage.setItem(window.stateModule.LAST_SUBMIT_TIME_KEY, Date.now().toString());
}

/**
 * Start cooldown timer for visual feedback
 * Updates submit button with countdown and manages button state
 */
function startCooldownTimer() {
  // Clear any existing timer to prevent multiple timers
  if (window.cooldownTimer) {
    clearInterval(window.cooldownTimer);
  }

  const updateTimer = () => {
    const remaining = getRemainingCooldownSeconds();
    const submitBtn = document.getElementById("submitForm")?.querySelector('button[type="submit"]');
    
    if (remaining > 0 && submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = `Espera ${remaining}s...`;
    } else {
      // Cooldown finished
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Enviar solicitud";
      }
      clearInterval(window.cooldownTimer);
      window.cooldownTimer = null;
    }
  };

  // Update immediately and then every second
  updateTimer();
  window.cooldownTimer = setInterval(updateTimer, 1000);
}

/**
 * Update submit button state based on cooldown
 * Called during initialization and after submission
 */
function updateSubmitButtonState() {
  const submitBtn = document.getElementById("submitForm")?.querySelector('button[type="submit"]');
  if (!submitBtn) return;

  if (isSubmissionTooRecent()) {
    const remaining = getRemainingCooldownSeconds();
    submitBtn.disabled = true;
    submitBtn.textContent = `Espera ${remaining}s...`;
  } else {
    submitBtn.disabled = false;
    submitBtn.textContent = "Enviar solicitud";
  }
}

/**
 * Submit user ranking to the server
 * Handles duplicate prevention, validation, and error handling
 */
async function submitRanking(e) {
  e.preventDefault();

  // Check if we're already submitting (prevent rapid clicks)
  if (isSubmitting) {
    alert("Por favor espera, ya se está enviando tu solicitud...");
    return;
  }

  // Enhanced duplicate prevention using localStorage (persistent across page refreshes)
  if (isSubmissionTooRecent()) {
    const remaining = getRemainingCooldownSeconds();
    alert(
      `Por favor espera ${remaining} segundo(s) antes de enviar otra solicitud.\n\nEsto previene envíos duplicados por problemas de conexión.`,
    );
    return;
  }

  // Check if too soon since last submission (legacy check - in-memory only)
  const now = Date.now();
  if (now - lastSubmitTime < SUBMIT_DEBOUNCE_MS) {
    const remaining = Math.ceil(
      (SUBMIT_DEBOUNCE_MS - (now - lastSubmitTime)) / 1000,
    );
    alert(
      `Por favor espera ${remaining} segundo(s) antes de enviar otra solicitud.`,
    );
    return;
  }

  const name = document.getElementById("name").value.trim();
  const orderRaw = document.getElementById("order").value;
  const orderVal = window.utilsModule.normalizeOrder(orderRaw);
  const rankedItems = [...window.state.ranking];
  const id = window.utilsModule.getLocalUserId() || undefined;

  if (!name) return alert("Por favor, introduce tu nombre.");
  if (orderVal === null)
    return alert("El orden debe ser un número entero positivo.");
  if (!rankedItems.length) return alert("Selecciona al menos un destino.");

  try {
    const { taken } = await window.utilsModule.isOrderTakenRemote(orderVal);
    if (taken) {
      const proceed = confirm(
        `El orden ${orderVal} ya está siendo usado por otro usuario en ${window.state.season}.\n\n` +
          `Pulsa Aceptar para usarlo igualmente, o Cancelar para elegir otro número.`,
      );
      if (!proceed) {
        document.getElementById("order").value = "";
        window.state.quota = 0;
        window.uiModule.updateQuotaIndicators();
        window.uiModule.renderClickableItems();
        return;
      }
    }
  } catch {}

  // Set submitting state to prevent duplicate submissions
  isSubmitting = true;
  lastSubmitTime = now;
  setLastSubmissionTime(); // Store submission time immediately in localStorage

  // Generate unique request ID once for this submission attempt
  // This ID is used by the server to prevent processing the same request multiple times
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Disable submit button and show loading state
  const submitBtn = document.getElementById("submitForm").querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando...";

  try {
    // Submit to server with unique request ID
    const data = await window.api.submit({
      name,
      order: orderVal,
      rankedItems,
      id,
      season: window.state.season, // ✅ include season
      requestId, // Use the same requestId for this submission attempt
    });

    // Store user ID for future submissions
    if (data.id) {
      window.utilsModule.setLocalUserId(data.id);
      document.getElementById("userId").value = data.id;
    }

    // Refresh state and show success message
    await window.utilsModule.fetchState();
    alert("¡Guardado correctamente!");

    // Restart the cooldown timer after successful submission
    startCooldownTimer();
  } catch (error) {
    console.error("Submit error:", error);

    // Handle specific error cases
    if (error.status === 429) {
      // Rate limited - show specific message
      alert(error.body?.message || error.message);
    } else {
      // Generic error
      alert(`Error al enviar: ${error.message}`);
    }
  } finally {
    // Re-enable submit button
    isSubmitting = false;
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;

    // Update button state based on cooldown
    updateSubmitButtonState();
  }
}

/**
 * Reset all submissions for the current user
 */
async function resetAll() {
  const localId = window.utilsModule.getLocalUserId();
  if (!localId) {
    alert(
      "No se encontró un ID de usuario local. Envía tu ranking una vez para crear tu usuario primero.",
    );
    return;
  }
  if (
    !confirm(
      `¿Eliminar SOLO las solicitudes de este usuario local para la temporada ${window.state.season}?`,
    )
  )
    return;

  try {
    const data = await window.api.resetUser(localId, window.state.season); // send season
    window.state.ranking = [];
    await window.utilsModule.fetchState();
    document.getElementById("allocationResult").innerHTML = "";
    alert(
      `Se eliminaron ${data.removed ?? 0} solicitud(es) para este usuario.`,
    );
  } catch (e) {
    console.error("/api/reset-user failed:", e.status, e.body || e);
    alert(e.message || "No se pudo restablecer tus solicitudes");
  }
}

// Export functions for use by other modules
window.submissionModule = {
  submitRanking,
  resetAll,
  startCooldownTimer,
  updateSubmitButtonState,
  isSubmissionTooRecent,
  getRemainingCooldownSeconds,
};
