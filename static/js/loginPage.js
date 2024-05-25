import {
    socket
} from './socketClient.js';
/**
 * Shows a toastr message using the SweetAlert2 methods.
 * @param {string} type - Type of the toastr( 'success', 'error', 'warning', 'info').
 * @param {string} message - Message to show.
 * @param {number} duration - Duration in ms
 */


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
        var employee_id = document.getElementById("employee_id").value;

        if (!employee_id) {
            showToast("error", "Please enter your ID number.");
            resolve(false);
        } else {
            validateEmployeeID(employee_id).then(isValid => {
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
        if (employees.hasOwnProperty(id)) {
            //Before doing that, we set a employee name on the page in a hidden input on the form
            var employeeName = employees[id];
            changeEmployeeName(employeeName);
            return true;
        } else {
            return false
        }

    } catch (error) {
        showToast("error", "Error reading employee database.");
        return false;
    }
}

// Clears the employee ID input field
function clearEmployeeId() {
    // Get input
    var employeeIdInput = document.getElementById("employee_id");

    // Clear it
    employeeIdInput.value = "";
}

// Changes the input type hidden in the form to update the name
function changeEmployeeName(newName) {
    // Gets the hidden input
    var employeeNameInput = document.getElementById("employee_name");

    // Changes its value
    employeeNameInput.value = newName;
}

// Gets the currently saved employee name
function getEmployeeName() {
    // Gets the input
    var employeeNameInput = document.getElementById("employee_name");

    // Gets the value
    var employeeName = employeeNameInput.value;

    // Returns it
    return employeeName;
}

function startEmployeeCheckin() {
    validateForm().then(isValid => {
        if (isValid) {
            var employee_id = document.getElementById("employee_id").value;
            var employee_name = getEmployeeName();

            var formData = {
                employeeId: employee_id,
                employeeName: employee_name
            };

            const bootstrapAlert = Swal.mixin({
                customClass: {
                    confirmButton: "btn btn-success ml-2",
                    cancelButton: "btn btn-danger"
                },
                buttonsStyling: true
            });

            bootstrapAlert.fire({
                title: "Hi " + employee_name.toString() + ", Do you want to clock in?",
                text: "This action cannot be undone. Confirming will record your clock-in.",
                icon: "info",
                confirmButtonText: "Clock in",
                cancelButtonText: "Cancel",
                showCancelButton: true,
                confirmButtonColor: "#3085d6",
                cancelButtonColor: "#d33",
                confirmButtonText: "Clock in",
                cancelButtonText: "Cancel",
            }).then((result) => {
                if (result.isConfirmed) {
                    startCheckIn(formData);
                } else if (
                    /* Read more about handling dismissals below */
                    result.dismiss === Swal.DismissReason.cancel
                ) {
                    console.log("Clock in dismissed")
                    //clearEmployeeId();
                }
            });
            //showToast("success", "Time logged!");

        }
    });

}

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');

    loginForm.addEventListener('submit', function(event) {
        event.preventDefault();

        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');

        // Check if the form fields are filled
        if (usernameInput.value === '' || passwordInput.value === '') {
            showToast('error', 'Please fill in all fields.');
            return;
        }

        $.ajax({
            url: '/login', // Let's go to our api endpoint
            type: 'POST',
            data: {
                username: usernameInput.value,
                password: passwordInput.value
            },
            success: function(response) {
                // We logged in!
                window.location.replace('http://' + document.domain + ':' + location.port + "/check_in")
                //document.write(response); 
            },
            error: function() {
                showToast('error', 'Error occurred while processing the request.');
            }
        });
    });
});

function startCheckIn(formData) {
    //var socket = io().connect('http://' + document.domain + ':' + location.port);
    console.log(formData);
    // Triggers the start_employee_clockin event, passing formData to the backend
    socket.emit('start_employee_clockin', formData);
    clearEmployeeId();
}
