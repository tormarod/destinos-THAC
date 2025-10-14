// public/events.js
// Event handlers and drag & drop functionality for the allocation system

/**
 * Set up drag and drop functionality for ranking table
 * Handles both mobile touch events and desktop drag events
 */
function setupDragAndDrop(container, isMobile) {
  let dragIndex = null;

  if (isMobile) {
    // Mobile touch drag-and-drop for cards
    const mobileContainer = container.querySelector(".mobile-ranking-container");
    if (mobileContainer) {
      let touchStartY = 0;
      let touchStartIndex = -1;
      let draggedCard = null;
      let draggedIndex = -1;

      mobileContainer.querySelectorAll(".mobile-ranking-card").forEach((card) => {
        // Touch events for mobile drag-and-drop
        card.addEventListener("touchstart", (e) => {
          e.preventDefault();
          touchStartY = e.touches[0].clientY;
          touchStartIndex = Number(card.dataset.index);
          draggedCard = card;
          draggedIndex = touchStartIndex;
        });

        card.addEventListener("touchmove", (e) => {
          e.preventDefault();
          if (!draggedCard) return;

          const touchY = e.touches[0].clientY;
          const deltaY = touchY - touchStartY;

          // Start dragging after 10px movement
          if (Math.abs(deltaY) > 10) {
            draggedCard.classList.add("dragging");
            draggedCard.style.transform = `translateY(${deltaY}px)`;
          } else {
            draggedCard.style.transform = `translateY(${deltaY}px)`;

            // Find which card we're over
            const cards = mobileContainer.querySelectorAll(".mobile-ranking-card");
            let overIndex = -1;

            cards.forEach((otherCard, index) => {
              if (otherCard === draggedCard) return;

              const rect = otherCard.getBoundingClientRect();
              const cardCenter = rect.top + rect.height / 2;

              if (touchY < cardCenter && touchY > rect.top) {
                overIndex = index;
              }
            });

            // Update visual feedback
            cards.forEach((otherCard, index) => {
              if (otherCard !== draggedCard) {
                otherCard.classList.toggle("drag-over", index === overIndex);
              }
            });
          }
        });

        card.addEventListener("touchend", (e) => {
          e.preventDefault();
          if (!draggedCard) return;

          const touchY = e.changedTouches[0].clientY;
          const deltaY = touchY - touchStartY;

          // Clear visual feedback
          mobileContainer.querySelectorAll(".mobile-ranking-card").forEach((card) => {
            card.classList.remove("drag-over");
          });

          if (Math.abs(deltaY) > 10) {
            // Find drop target
            const cards = mobileContainer.querySelectorAll(".mobile-ranking-card");
            let dropIndex = -1;

            cards.forEach((otherCard, index) => {
              if (otherCard === draggedCard) return;

              const rect = otherCard.getBoundingClientRect();
              const cardCenter = rect.top + rect.height / 2;

              if (touchY < cardCenter && touchY > rect.top) {
                dropIndex = index;
              }
            });

            // Perform the reorder if we have a valid drop target
            if (dropIndex !== -1 && dropIndex !== draggedIndex) {
              const moved = window.state.ranking.splice(draggedIndex, 1)[0];
              window.state.ranking.splice(dropIndex, 0, moved);
              window.uiModule.renderRankingTable();
              window.uiModule.updateQuotaIndicators();
            } else {
              // Reset position if no valid drop
              window.uiModule.renderRankingTable();
            }
          } else {
            // Just a tap, no drag - reset position
            draggedCard.style.transform = "";
          }

          // Reset drag state
          draggedCard.classList.remove("dragging");
          draggedCard.style.transform = "";
          draggedCard = null;
          draggedIndex = -1;
        });
      });
    }
  } else {
    // Desktop drag-and-drop for table rows
    const tbody = container.querySelector("tbody");
    if (tbody) {
      tbody.querySelectorAll("tr").forEach((tr) => {
        tr.addEventListener("dragstart", (e) => {
          dragIndex = Number(tr.dataset.index);
          tr.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
        });
        tr.addEventListener("dragend", () => {
          tr.classList.remove("dragging");
        });
        tr.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        });
        tr.addEventListener("drop", (e) => {
          e.preventDefault();
          const overIndex = Number(e.currentTarget.dataset.index);
          if (dragIndex === null || overIndex === dragIndex) return;
          const moved = window.state.ranking.splice(dragIndex, 1)[0];
          window.state.ranking.splice(overIndex, 0, moved);
          window.uiModule.renderRankingTable();
          window.uiModule.updateQuotaIndicators();
        });
      });
    }
  }
}

/**
 * Set up all event listeners for the application
 * This function is called during initialization
 */
function setupEventListeners() {
  // Season selection
  const seasonSelect = document.getElementById("seasonSelect");
  if (seasonSelect) {
    seasonSelect.addEventListener("change", async (e) => {
      const season = e.target.value;
      await window.scenariosModule.setSeason(season);
      window.state.ranking = [];
      // UI updates are now handled automatically in setSeason()
    });
  }

  // User ID change - reload data when user enters their ID
  const userIdInput = document.getElementById("userId");
  if (userIdInput) {
    userIdInput.addEventListener("blur", async (e) => {
      const userId = e.target.value.trim();
      if (userId && userId !== window.utilsModule.getLocalUserId()) {
        console.log("User ID changed, reloading data");
        window.utilsModule.setLocalUserId(userId);
        await window.scenariosModule.reloadSeasonData();
      }
    });
  }

  // Form submission
  const submitForm = document.getElementById("submitForm");
  if (submitForm) {
    submitForm.addEventListener("submit", submitRanking);
  }

  // Allocation button
  const allocateBtn = document.getElementById("allocateBtn");
  if (allocateBtn) {
    allocateBtn.addEventListener("click", async () => {
      if (window.runAllocation) {
        await window.runAllocation(window.state.season);
      }
    });
  }

  // Reset all button
  const resetAllBtn = document.getElementById("resetAllBtn");
  if (resetAllBtn) {
    resetAllBtn.addEventListener("click", resetAll);
  }

  // Search input
  const itemSearch = document.getElementById("itemSearch");
  if (itemSearch) {
    itemSearch.addEventListener("input", (e) => {
      window.state.searchTerm = e.target.value.trim();
      window.state.page = 1; // reset to first page on new search
      window.uiModule.renderClickableItems();
    });
  }

  // Reset self button
  const resetSelfBtn = document.getElementById("resetSelfBtn");
  if (resetSelfBtn) {
    resetSelfBtn.addEventListener("click", async () => {
      const uid = window.utilsModule.getLocalUserId();
      if (!uid) {
        alert("No se encontró un ID de usuario local.");
        return;
      }

      if (confirm("¿Estás seguro de que quieres eliminar tu envío?")) {
        try {
          const response = await fetch("/api/reset-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: uid, season: window.state.season }),
          });

          if (response.ok) {
            alert("Envío eliminado correctamente.");
            window.state.ranking = [];
            window.uiModule.renderClickableItems();
            window.uiModule.renderRankingTable();
            window.uiModule.updateQuotaIndicators();
          } else {
            const error = await response.json();
            alert(`Error: ${error.error || "Error desconocido"}`);
          }
        } catch (error) {
          console.error("Error resetting user:", error);
          alert("Error al eliminar el envío.");
        }
      }
    });
  }

  // Scenario selection
  const scenarioSelect = document.getElementById("scenarioSelect");
  const scenarioDescription = document.getElementById("scenarioDescription");
  if (scenarioSelect) {
    scenarioSelect.addEventListener("change", (e) => {
      const selectedValue = e.target.value;
      if (scenarioDescription) {
        scenarioDescription.textContent =
          selectedValue === "0"
            ? "Estado actual de la asignación"
            : selectedValue === "1"
            ? "Si usuarios restantes contestasen"
            : selectedValue === "2"
            ? "Si destinos específicos se ocupan"
            : selectedValue === "3"
            ? "Bloqueo de preferencias"
            : "Estado actual de la asignación";
      }
    });
  }

  // Preview blocked items button
  const previewBlockedItemsBtn = document.getElementById("previewBlockedItemsBtn");
  if (previewBlockedItemsBtn) {
    previewBlockedItemsBtn.addEventListener("click", async () => {
      const selectedLocalidades = Array.from(
        document.getElementById("localidadSelect").selectedOptions,
      ).map((opt) => opt.value);
      const selectedCentros = Array.from(
        document.getElementById("centroSelect").selectedOptions,
      ).map((opt) => opt.value);

      if (selectedLocalidades.length === 0 && selectedCentros.length === 0) {
        alert("Por favor selecciona al menos una localidad o centro.");
        return;
      }

      const blockedItems = {
        selectedLocalidades,
        selectedCentros,
      };

      showBlockedItemsPreview(blockedItems);
    });
  }

  // Clear selection button
  const clearSelectionBtn = document.getElementById("clearSelectionBtn");
  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener("click", () => {
      document.getElementById("localidadSelect").selectedIndex = -1;
      document.getElementById("centroSelect").selectedIndex = -1;
      document.getElementById("blockedItemsPreview").style.display = "none";
    });
  }

  // Order input
  const orderInput = document.getElementById("order");
  if (orderInput) {
    orderInput.addEventListener("input", () => {
      window.state.quota = Math.max(0, Number(orderInput.value) || 0);
      window.uiModule.renderClickableItems();
      window.uiModule.updateQuotaIndicators();
    });
  }

  // Competition depth input
  const competitionDepthInput = document.getElementById("competitionDepthInput");
  if (competitionDepthInput) {
    competitionDepthInput.addEventListener("input", (e) => {
      const value = Math.max(1, Math.min(20, Number(e.target.value) || 3));
      window.state.competitionDepth = value;
      e.target.value = value; // Ensure the input shows the clamped value
    });
  }

  // Window resize handler
  window.addEventListener("resize", () => {
    window.uiModule.renderClickableItems();
    window.uiModule.renderRankingTable();
  });
}

// Export functions for use by other modules
window.eventsModule = {
  setupDragAndDrop,
  setupEventListeners,
};
