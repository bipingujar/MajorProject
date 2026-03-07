(() => {
  "use strict";

  const forms = document.querySelectorAll(".needs-validation");

  Array.from(forms).forEach((form) => {
    form.addEventListener(
      "submit",
      (event) => {
        if (!form.checkValidity()) {
          event.preventDefault();
          event.stopPropagation();
        }

        form.classList.add("was-validated");
      },
      false
    );
  });
})();

(() => {
  const themeBtn = document.getElementById("themeToggleBtn");
  const themeIcon = document.getElementById("themeToggleIcon");

  if (!themeBtn || !themeIcon) {
    return;
  }

  const setTheme = (theme) => {
    const safeTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", safeTheme);
    document.documentElement.setAttribute("data-bs-theme", safeTheme);
    localStorage.setItem("theme", safeTheme);
    themeIcon.className = safeTheme === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";
    themeBtn.setAttribute(
      "aria-label",
      safeTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"
    );
  };

  const currentTheme = localStorage.getItem("theme") === "dark" ? "dark" : "light";
  setTheme(currentTheme);

  themeBtn.addEventListener("click", () => {
    const activeTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    setTheme(activeTheme === "dark" ? "light" : "dark");
  });
})();

(() => {
  const wishlistButtons = document.querySelectorAll(".wishlist-btn");

  if (!wishlistButtons.length) {
    return;
  }

  const setButtonState = (button, wishlisted) => {
    button.dataset.wishlisted = wishlisted ? "true" : "false";
    const icon = button.querySelector("i");
    const label = button.querySelector("span");

    if (icon) {
      icon.classList.toggle("fa-solid", wishlisted);
      icon.classList.toggle("fa-regular", !wishlisted);
    }
    if (label) {
      label.textContent = wishlisted ? "Wishlisted" : "Add to Wishlist";
    }
  };

  wishlistButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const listingId = button.dataset.listingId;
      const isAuthenticated = button.dataset.authenticated === "true";

      if (!listingId) {
        return;
      }

      if (!isAuthenticated) {
        window.location.href = "/login";
        return;
      }

      button.disabled = true;

      try {
        const response = await fetch(`/listings/${listingId}/wishlist`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "X-Requested-With": "XMLHttpRequest",
          },
        });

        if (!response.ok) {
          throw new Error("Failed to update wishlist");
        }

        const result = await response.json();
        if (typeof result.wishlisted === "boolean") {
          setButtonState(button, result.wishlisted);
        }
      } catch (error) {
        window.location.reload();
      } finally {
        button.disabled = false;
      }
    });
  });
})();

(() => {
  const toggleBtn = document.getElementById("chatbotToggleBtn");
  const widget = document.getElementById("chatbotWidget");
  const closeBtn = document.getElementById("chatbotCloseBtn");
  const form = document.getElementById("chatbotForm");
  const input = document.getElementById("chatbotInput");
  const sendBtn = document.getElementById("chatbotSendBtn");
  const messages = document.getElementById("chatbotMessages");

  if (!toggleBtn || !widget || !closeBtn || !form || !input || !sendBtn || !messages) {
    return;
  }

  const appendTextMessage = (text, role) => {
    const node = document.createElement("div");
    node.className = `chatbot-msg ${role === "user" ? "chatbot-msg-user" : "chatbot-msg-bot"}`;
    node.textContent = text;
    messages.appendChild(node);
    messages.scrollTop = messages.scrollHeight;
  };

  const appendSuggestionLinks = (suggestions = []) => {
    if (!Array.isArray(suggestions) || !suggestions.length) {
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "chatbot-links";

    suggestions.forEach((item) => {
      if (!item || !item.url || !item.title) {
        return;
      }
      const link = document.createElement("a");
      link.href = item.url;
      link.className = "chatbot-link-chip";

      const title = document.createElement("div");
      title.className = "chatbot-link-title";
      title.textContent = item.title;
      link.appendChild(title);

      if (item.subtitle) {
        const subtitle = document.createElement("div");
        subtitle.className = "chatbot-link-subtitle";
        subtitle.textContent = item.subtitle;
        link.appendChild(subtitle);
      }

      wrap.appendChild(link);
    });

    if (wrap.children.length) {
      messages.appendChild(wrap);
      messages.scrollTop = messages.scrollHeight;
    }
  };

  const setOpen = (open) => {
    widget.classList.toggle("is-open", open);
    toggleBtn.style.display = open ? "none" : "inline-flex";
    if (open) {
      input.focus();
    }
  };

  toggleBtn.addEventListener("click", () => setOpen(true));
  closeBtn.addEventListener("click", () => setOpen(false));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;

    appendTextMessage(question, "user");
    input.value = "";
    sendBtn.disabled = true;

    try {
      const response = await fetch("/listings/chatbot/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ question }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to get response.");
      }

      appendTextMessage(result.answer || "I could not generate an answer.", "bot");
      appendSuggestionLinks(result.suggestions || []);
    } catch (error) {
      appendTextMessage("Sorry, I could not process that right now. Please try again.", "bot");
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  });
})();
