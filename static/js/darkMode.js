// Function that toggles the dark mode using the button
function toggleDarkMode() {
  // Get the dark toggle checkbox
  const checkbox = document.getElementById("checkbox");

  // Get the elements you want to modify
  const sideBarBranding = document.getElementById("sideBarBranding");
  const sideBarBackground = document.getElementById("sideBarBackground");

  // If it's checked then set the dark theme
  if (checkbox.checked) {
      localStorage.setItem('isDarkTheme', true);
      document.documentElement.setAttribute("data-bs-theme", "dark");

      // Add or remove classes based on dark mode
      sideBarBranding.classList.remove("text-dark");
      sideBarBranding.classList.add("text-white");

      sideBarBackground.classList.remove("bg-white");
      sideBarBackground.classList.add("bg-dark");
  } else {
      localStorage.setItem('isDarkTheme', false);
      // Otherwise go with the white theme
      document.documentElement.removeAttribute("data-bs-theme");

      // Add or remove classes based on light mode
      sideBarBranding.classList.remove("text-white");
      sideBarBranding.classList.add("text-dark");

      sideBarBackground.classList.remove("bg-dark");
      sideBarBackground.classList.add("bg-white");

  }
}


// Function that checks if dark mode is enabled
function isDarkMode() {
  // Get the current value of data-bs-theme attribute on the root HTML element
  const currentTheme = document.documentElement.getAttribute("data-bs-theme");

  // Check if the current theme is 'dark'
  return currentTheme === "dark";
}

function checkDarkModeLocalStorage() {

  // Get the dark toggle checkbox
  const checkbox = document.getElementById("checkbox");

  // Get the elements you want to modify
  const sideBarBranding = document.getElementById("sideBarBranding");
  const sideBarBackground = document.getElementById("sideBarBackground");


  if (localStorage.getItem('isDarkTheme') == "true") {

      document.documentElement.setAttribute("data-bs-theme", "dark");

      // Add or remove classes based on dark mode
      sideBarBranding.classList.remove("text-dark");
      sideBarBranding.classList.add("text-white");

      sideBarBackground.classList.remove("bg-white");
      sideBarBackground.classList.add("bg-dark");

      checkbox.checked = true;
  } else {
      // Otherwise go with the white theme
      document.documentElement.removeAttribute("data-bs-theme");

      // Add or remove classes based on light mode
      sideBarBranding.classList.remove("text-white");
      sideBarBranding.classList.add("text-dark");

      sideBarBackground.classList.remove("bg-dark");
      sideBarBackground.classList.add("bg-white");

      checkbox.checked = false;
  }
}




$(document).ready(function() {
  //Makes dark mode persist on page switch.
  checkDarkModeLocalStorage();
});