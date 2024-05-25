import {
    socket
} from './socketClient.js';

/**
 * Shows a toast message using SweetAlert2
 * @param {string} type - Type of the toastr( 'success', 'error', 'warning', 'info').
 * @param {string} message - Message to show.
 * @param {number} duration - Duration in ms
 */

let employee_table;

socket.on('redirect_home', function() {
    window.location.replace('/');
});

function formatTimestamp(timestampString, format = "default") {
    const date = new Date(timestampString);

    if (format === "default") {
        return new Intl.DateTimeFormat("en-US", {
            month: "2-digit",
            day: "2-digit",
            year: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
        }).format(date);
    }

    // Other formats can be added here
    if (format === "date") {
        return new Intl.DateTimeFormat("en-US", {
            month: "2-digit",
            day: "2-digit",
            year: "numeric",
        }).format(date);
    }

    console.error("Invalid format. Using default format.");
    return formatTimestamp(timestampString, "default");
}

function getCookie(name) {
    // Add the equals sign to the name (representing the start of the value)
    let nameEQ = name + "=";

    // Split document.cookie on semicolons into an array of name-value pairs
    let ca = document.cookie.split(';');

    // Loop through the name-value pairs
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];

        // Remove leading whitespace characters
        while (c.charAt(0) === ' ') c = c.substring(1);

        // Check if the cookie's name matches the passed name
        if (c.indexOf(nameEQ) === 0) {
            // Return the cookie's value, which is the substring after the name and equals sign
            return c.substring(nameEQ.length, c.length);
        }
    }
    // Return null if the cookie was not found
    return null;
}

$(document).ready(function() {
    let deviceId = getCookie('device_id');
    const approveDeviceButton = document.querySelector('.approveDeviceButton');

    if (deviceId && approveDeviceButton) {
        approveDeviceButton.disabled = true;
        approveDeviceButton.textContent = "Clock-ins are allowed from this device";
    }
    // new DT implementation
    var table = $('#employee_list').DataTable({
        responsive: true,
        columns: [{
                title: 'Employee Name',
                data: 'name',
                width: '21%',
                className: 'min-desktop',
                visible: false
            },
            {
                title: 'Employee ID',
                data: 'id',
                width: '15%',
                className: 'min-desktop',
                visible: false
            },
            {
                title: 'Clock In',
                data: 'clock_in',
                width: '20%',
                className: 'all'
            },
            {
                title: 'Clock Out',
                data: 'clock_out',
                width: '20%',
                className: 'all'
            },
            {
                title: 'Hours Worked',
                data: 'hours_worked',
                width: '24%',
                className: 'all'
            },
            {
                title: "UUID",
                data: "uuid",
                visible: false
            }
        ]
    });

    function fetchEmployeeHoursIfReady() {
        const employeeId = document.getElementById("employee_id").value;
        const startDate = $('#datePickerStart').val();
        const endDate = $('#datePickerTo').val();

        if (employeeId && startDate && endDate) {
            $.ajax({
                url: `/admin/get_employees_hours?user_id=${employeeId}&start_date=${startDate}&end_date=${endDate}`,
                type: 'GET',
                success: function(data) {
                    table.clear().rows.add(data).draw();
                    showToast('success', 'Hours fetched successfully');
                },
                error: function(error) {
                    console.error('Error:', error);
                    showToast('error', 'Failed to fetch hours');
                }
            });
        }
    }

    // Calculate today's date
    const today = new Date();
    const todayFormatted = today.toISOString().substring(0, 10); // Format to YYYY-MM-DD

    // Calculate the date for 14 days ago
    const fourteenDaysAgo = new Date(new Date().setDate(today.getDate() - 14));
    const fourteenDaysAgoFormatted = fourteenDaysAgo.toISOString().substring(0, 10); // Format to YYYY-MM-DD

    // Set the default values of the date pickers
    $('#datePickerStart').val(fourteenDaysAgoFormatted);
    $('#datePickerTo').val(todayFormatted);
    fetchEmployeeHoursIfReady();

    $('#datePickerStart, #datePickerTo').change(fetchEmployeeHoursIfReady);

    // other
    checkIfEmployeehasToClockOut();

    var collapsedGroups = {};

    $.fn.dataTable.moment("MM/DD/YYYY, hh:mm:ss A");

    employee_table = new DataTable("#employeeRecords", {
        dom: "Bfrtip",
        buttons: [{
                extend: "pdfHtml5",
                title: "Check in/out history of " +
                    document.getElementById("username").value,
                exportOptions: {
                    columns: ":visible:not(.no-export)",
                },
            },
            {
                extend: "excelHtml5",
                title: "Check in/out history of " +
                    document.getElementById("username").value,
                exportOptions: {
                    columns: ":visible:not(.no-export)",
                },
            },
        ],
        ajax: {
            url: "/get_employee_records/" + document.getElementById("employee_id").value,
            dataSrc: "",
        },
        columns: [{
                data: "clock_in",
                render: function(data, type, row) {
                    // type 'sort' is used when DataTables is sorting the column
                    // type 'display' is used when DataTables is rendering the column for display
                    return type === "sort" ? data : formatTimestamp(data);
                },
            },
            {
                data: "clock_out",
                render: function(data, type, row) {
                    return type === "sort" ?
                        data :
                        data ?
                        formatTimestamp(data) :
                        "Still Clocked in";
                },
            },
            {
                data: null,
                render: function(data, type, row) {
                    if (row.clock_out) {
                        // Dates difference
                        const startTime = new Date(row.clock_in);
                        const endTime = new Date(row.clock_out);
                        const diffInMillis = endTime - startTime;

                        // Calculate hours and minutes
                        const hours = Math.floor(diffInMillis / (1000 * 60 * 60));
                        const minutes = Math.floor(
                            (diffInMillis % (1000 * 60 * 60)) / (1000 * 60)
                        );

                        return hours + "h " + minutes + "m";
                    } else {
                        return "Still Clocked in";
                    }
                },
            },
            {
                // Add the column for the expand/collapse button
                data: null,
                render: function(data, type, row) {
                    // Dummy column for the button, generated later
                    return "";
                },
            },
        ],
        columnDefs: [{
                width: "25%",
                targets: 0,
                orderData: [0]
            }, // Sort based on the first column
            {
                width: "35%",
                targets: 1,
                orderData: [1]
            }, // Sort based on the second column
        ],
        order: [
            [0, "desc"]
        ],
        initComplete: function() {
            //Add the buttons to the datatable container
            employee_table
                .buttons()
                .container()
                .appendTo("#employeeRecords_wrapper  .col-md-6:eq(0)");
        },
        rowGroup: {
            dataSrc: function(row) {
                var dateToGroup = formatTimestamp(row.clock_in, "date");
                //Value to group by, the clock in day.
                return dateToGroup;
            },
            startRender: function(rows, group) {
                //Where the actual grouping happens, I hope I can understand this again some other day
                var collapsed = !!collapsedGroups[group];

                rows.nodes().each(function(r) {
                    r.style.display = collapsed ? "none" : "";
                });

                // Calculate the sum of the hours in the group
                var totalHours = 0;
                var totalMinutes = 0;
                //For each node in the subgroup add the time
                rows.nodes().each(function(r) {
                    var rowData = employee_table.row(r).data();
                    if (rowData.clock_out) {
                        const startTime = new Date(rowData.clock_in);
                        const endTime = new Date(rowData.clock_out);
                        const diffInMillis = endTime - startTime;

                        totalHours += Math.floor(diffInMillis / (1000 * 60 * 60));
                        totalMinutes += Math.floor(
                            (diffInMillis % (1000 * 60 * 60)) / (1000 * 60)
                        );
                    }
                });

                // Concatenate the final string
                var totalHoursString = totalHours + "h " + totalMinutes + "m";

                //Construct the header group tr
                var groupRow = $('<tr class="table-active"/>')
                    .append(
                        '<td colspan="2">' +
                        group +
                        " (" +
                        rows.count() +
                        " Clock ins)</td>"
                    )
                    .append("<td>" + totalHoursString + " (Total)</td>") // Total worked hours td
                    .attr("data-name", group)
                    .toggleClass("collapsed", collapsed)
                    .addClass("group-start");

                // Add the button to the tr, plus check if it's collapsed
                groupRow.append(
                    '<td><button class="btn btn-primary btn-sm expand-button">' +
                    (collapsedGroups[group] ?
                        '<i class="fas fa-plus"></i>' :
                        '<i class="fas fa-minus"></i>') +
                    "</button></td>"
                );

                return groupRow;
            },
        },
    });

    $("#employeeRecords tbody").on("click", "tr.group-start", function() {
        var name = $(this).data("name");
        collapsedGroups[name] = !collapsedGroups[name];
        employee_table.draw(false);
    });

    var dtButtons = document.querySelectorAll(".dt-button");

    // Iterate over each element and add the classes "btn" and "btn-primary"
    dtButtons.forEach(function(element) {
        element.classList.add("btn", "btn-secondary");
    });
});

// Listen for toast messages from the server
socket.on("toast_message", function(data) {
    showToast(data.category, data.message);
    //Stupid, but it works
    employee_table.ajax.reload();
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
        },
    });

    Toast.fire({
        icon: type,
        title: message,
    });
}

function validateForm() {
    return new Promise((resolve, reject) => {
        var employee_id = document.getElementById("employee_id").value;

        if (!employee_id) {
            showToast("error", "Please enter your ID number.");
            resolve(false);
        } else {
            validateEmployeeID(employee_id).then((isValid) => {
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
        const response = await fetch("/static/employee_db.json");
        const employees = await response.json();
        if (employees.hasOwnProperty(id)) {
            //Before doing that, we set a employee name on the page in a hidden input on the form
            var employeeName = employees[id].name;
            //changeEmployeeName(employeeName);
            return true;
        } else {
            return false;
        }
    } catch (error) {
        showToast("error", "Error reading employee database.");
        return false;
    }
}

function startEmployeeCheckin() {
    console.log("employeeCheckIn");
    validateForm().then((isValid) => {
        if (isValid) {
            var employee_id = document.getElementById("employee_id").value;
            var employee_name = document.getElementById("username").value;

            var formData = {
                employeeId: employee_id,
                employeeName: employee_name,
            };

            const bootstrapAlert = Swal.mixin({
                customClass: {
                    confirmButton: "btn btn-success ml-2",
                    cancelButton: "btn btn-danger",
                },
                buttonsStyling: true,
            });
            var currentStatus = getClockOutButtonText();
            bootstrapAlert
                .fire({
                    title: "Hi " +
                        employee_name.toString() +
                        ", do you want to " +
                        currentStatus +
                        "?",
                    text: "This action cannot be undone. Confirming will record your " +
                        currentStatus,
                    icon: "info",
                    confirmButtonText: currentStatus,
                    cancelButtonText: "Cancel",
                    showCancelButton: true,
                    confirmButtonColor: "#3085d6",
                    cancelButtonColor: "#d33",
                })
                .then((result) => {
                    if (result.isConfirmed) {
                        var currentStatus = getClockOutButtonText();
                        const button = document.querySelector(".clockInOutButton");
                        currentStatus == "Clock In" ?
                            (button.textContent = "Clock Out") :
                            (button.textContent = "Clock In");
                        startCheckIn(formData);
                    } else if (
                        /* Read more about handling dismissals below */
                        result.dismiss === Swal.DismissReason.cancel
                    ) {
                        console.log("Clock in dismissed");
                        clearEmployeeId();
                    }
                });
            //showToast("success", "Time logged!");
        }
    });
}

function verifyAdminPassword(password) {
    const employee_name = document.getElementById("username").value;
    return fetch('/admin/verify-admin-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: employee_name,
                password: password
            }) // Use actual admin username
        })
        .then(response => response.json())
        .then(data => data.isValid);
}

function approveDeviceFlow() {
    console.log("Initiating device authorization");
    const employee_name = document.getElementById("username").value;

    const bootstrapAlert = Swal.mixin({
        customClass: {
            confirmButton: "btn btn-success ml-2",
            cancelButton: "btn btn-danger",
        },
        buttonsStyling: true,
    });

    bootstrapAlert.fire({
        title: "Admin Authorization Required",
        text: "Are you sure you wish to allow clock-ins from this device? This action cannot be undone.",
        icon: "warning",
        input: 'password',
        inputPlaceholder: 'Enter your password',
        inputAttributes: {
            autocapitalize: 'off',
            autocorrect: 'off'
        },
        confirmButtonText: "Authorize",
        cancelButtonText: "Cancel",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
    }).then((result) => {
        if (result.isConfirmed && result.value) {
            const password = result.value;
            // Verify the password here with your backend before proceeding
            verifyAdminPassword(password).then(isValid => {
                if (isValid) {
                    Swal.fire({
                        title: 'Authorized!',
                        text: 'This device has been successfully authorized for clock-ins.',
                        icon: 'success'
                    });
                    document.querySelector('.approveDeviceButton').disabled = true;
                    document.querySelector('.approveDeviceButton').textContent = "Clock-ins are allowed from this device";
                    // Further actions post authorization can be triggered here
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Authorization Failed',
                        text: 'Incorrect password. This device has not been authorized.',
                        icon: 'error'
                    });
                }
            });
        } else if (result.dismiss === Swal.DismissReason.cancel) {
            console.log("Device authorization cancelled");
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const clockInOutButton = document.querySelector('.approveDeviceButton');
    if (clockInOutButton) {
        clockInOutButton.addEventListener('click', approveDeviceFlow);
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const clockInOutButton = document.querySelector('.clockInOutButton');
    if (clockInOutButton) {
        clockInOutButton.addEventListener('click', startEmployeeCheckin);
    }
});

function startCheckIn(formData) {
    //var socket = io.connect("http://" + document.domain + ":" + location.port);
    console.log(formData);

    socket.emit("start_employee_clockin", formData);

    // Emit 'check_autolog' event to check the auto-logout setting
    socket.emit('check_autolog', {
        'message': 'Checking auto-logout setting'
    });

    // Listen for the 'receive_autolog_check' event from the server
    socket.on('receive_autolog_check', function(data) {
        console.log('Auto-logout status received:', data.message);
        const autoLogoutEnabled = (data.message === 'True'); // Convert the string 'true'/'false' to a boolean
        if (autoLogoutEnabled) {
            // If auto-logout is enabled, execute the setTimeout block
            setTimeout(function() {
                // Send a POST request to the logout endpoint
                fetch('/logout', {
                        method: 'POST',
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest'
                        }
                    })
                    .then(response => response.json())
                    .then(data => {
                        console.log(data.message); // Log the response from the server
                        window.location.replace('/'); // Redirect to home or login page
                    })
                    .catch((error) => {
                        console.error('Error:', error);
                    });
            }, 3000);
        }
    });
}

function checkIfEmployeehasToClockOut() {
    const user_id = document.getElementById("employee_id").value; // Replace with the desired user ID
    const endpoint = "/api/check_if_user_clocked_out"; // Replace with your backend path

    // Send a request to the backend
    fetch(endpoint + `?user_id=${user_id}`)
        .then((response) => response.json())
        .then((data) => {
            // Modify the button text based on the backend response
            const button = document.querySelector(".clockInOutButton");
            if (data.hasToClockOut) {
                button.textContent = "Clock Out";
            } else {
                button.textContent = "Clock In";
            }
        })
        .catch((error) =>
            console.error("Error during the request to the backend:", error)
        );
}

// Just a little trick to not complicate stuff
function getClockOutButtonText() {
    const button = document.querySelector(".clockInOutButton");
    return button.textContent.trim();
}
