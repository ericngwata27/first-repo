// ===== 1. Grab the parts of the page we need to work with =====
const form = document.getElementById("option-form");
const list = document.getElementById("options-list");
const emptyMessage = document.getElementById("empty-message");
const filterButtons = document.querySelectorAll(".filter");

// ===== 2. Load any saved options from the browser =====
// localStorage is a small storage space in the browser that keeps data
// even after you close the page. We store our list there as text.
let options = loadOptions();

// Which filter is selected: "All", "University", or "Job"
let currentFilter = "All";

function loadOptions() {
  try {
    const saved = localStorage.getItem("future-options");
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    return []; // if anything goes wrong, just start with an empty list
  }
}

function saveOptions() {
  try {
    localStorage.setItem("future-options", JSON.stringify(options));
  } catch (error) {
    // Some browsers block storage (e.g. private mode). The page still works,
    // the list just won't be remembered next time.
  }
}

// ===== 3. When the form is submitted, add a new option =====
form.addEventListener("submit", function (event) {
  event.preventDefault(); // stop the page from reloading

  // Build an object with everything the user typed in
  const newOption = {
    id: Date.now(), // a unique number so we can find this option later
    type: document.getElementById("type").value,
    name: document.getElementById("name").value,
    location: document.getElementById("location").value,
    money: document.getElementById("money").value,
    rating: document.getElementById("rating").value,
    notes: document.getElementById("notes").value,
  };

  options.push(newOption); // add it to our list
  saveOptions();           // remember it
  showOptions();           // redraw the list on the page
  form.reset();            // clear the form for the next entry
});

// ===== 4. Delete an option =====
function deleteOption(id) {
  // Keep every option except the one with this id
  options = options.filter(function (option) {
    return option.id !== id;
  });
  saveOptions();
  showOptions();
}

// ===== 5. Filter buttons (All / Universities / Jobs) =====
filterButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    currentFilter = button.dataset.filter;

    // Highlight only the button that was clicked
    filterButtons.forEach(function (b) {
      b.classList.remove("active");
    });
    button.classList.add("active");

    showOptions();
  });
});

// ===== 6. Draw the list of options on the page =====
function showOptions() {
  list.innerHTML = ""; // clear out the old cards first

  // Only keep options that match the selected filter
  const visible = options.filter(function (option) {
    return currentFilter === "All" || option.type === currentFilter;
  });

  // Show the "Nothing here yet" message if there's nothing to show
  emptyMessage.style.display = visible.length === 0 ? "block" : "none";

  // Make one card for each option
  visible.forEach(function (option) {
    const card = document.createElement("div");
    card.className = "option";

    // Universities have a cost, jobs have a salary
    const moneyLabel = option.type === "University" ? "Yearly cost" : "Salary";
    const moneyText = option.money ? "$" + Number(option.money).toLocaleString() : "Not set";

    // Turn a number like 4 into "★★★★☆"
    const stars = "★".repeat(option.rating) + "☆".repeat(5 - option.rating);

    // Fill in the card. We use textContent below (not innerHTML) for anything
    // the user typed, so it is always shown as plain text.
    card.innerHTML = `
      <span class="tag ${option.type}"></span>
      <h3></h3>
      <p><strong>Location:</strong> <span class="location"></span></p>
      <p><strong>${moneyLabel}:</strong> ${moneyText}</p>
      <p class="stars">${stars}</p>
      <p class="notes"></p>
      <button class="delete-button">Delete</button>
    `;
    card.querySelector(".tag").textContent = option.type;
    card.querySelector("h3").textContent = option.name;
    card.querySelector(".location").textContent = option.location || "Not set";
    card.querySelector(".notes").textContent = option.notes;

    // Hook up the delete button for this card
    card.querySelector(".delete-button").addEventListener("click", function () {
      deleteOption(option.id);
    });

    list.appendChild(card);
  });
}

// ===== 7. Show whatever is saved as soon as the page loads =====
showOptions();
