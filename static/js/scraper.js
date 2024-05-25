/**
 * Shows a toastr message using the SweetAlert2 methods.
 * @param {string} type - Type of the toastr ('success', 'error', 'warning', 'info').
 * @param {string} message - Message to show.
 * @param {number} duration - Duration in ms.
 */

import { socket } from './socketClient.js';

// Listen for toast messages from the server
socket.on('toast_message', function(data) {
    showToast(data.category, data.message);
});

function showToast(type = "success", message, duration = 3000) {
    const Toast = Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: duration,
        timerProgressBar: true,
        didOpen: (toast) => {
            toast.onmouseenter = Swal.stopTimer;
            toast.onmouseleave = Swal.resumeTimer;
        }
    });

    Toast.fire({
        icon: type,
        title: message
    });
}

function validateForm() {
    return new Promise((resolve, reject) => {
        var outputDirName = document.getElementById("output_dir_name").value;

        if (!outputDirName) {
            showToast("error", "Please enter your ID number.");
            resolve(false);
        } else {
            validateEmployeeID(outputDirName).then(isValid => {
                if (!isValid) {
                    showToast("error", "Employee ID not found.");
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        }
    });
}

async function validateEmployeeID(id) {
    try {
        const response = await fetch('/static/employee_db.json');
        const employees = await response.json();
        return employees.hasOwnProperty(id);
    } catch (error) {
        showToast("error", "Error reading employee database.");
        return false;
    }
}

function startScraper() {
    validateForm().then(isValid => {
        if (isValid) {
            var outputDirName = document.getElementById("output_dir_name").value;

            var formData = {
                outputDirName: outputDirName,
            };

            //showToast("success", "Time logged!");
            downloadImages(formData);
        }
    });
}

// Function that checks if dark mode is enabled
function isDarkMode() {
    // Get the current value of data-bs-theme attribute on the root HTML element
    const currentTheme = document.documentElement.getAttribute('data-bs-theme');

    // Check if the current theme is 'dark'
    return currentTheme === 'dark';
}

// Function that toggles the dark mode using the button
function toggleDarkMode() {
    // Get the dark toggle checkbox
    const checkbox = document.getElementById('checkbox');

    // If it's checked then set the dark theme
    if (checkbox.checked) {
        document.documentElement.setAttribute('data-bs-theme', 'dark');
    } else {
        // Otherwise go with the white theme
        document.documentElement.removeAttribute('data-bs-theme');
    }
}

function downloadImages(formData) {
    var socket = io().connect('http://' + document.domain + ':' + location.port);
    console.log(formData);
    // Triggers the start_scraper event, passing formData to the backend
    socket.emit('start_scraper', formData);
}
