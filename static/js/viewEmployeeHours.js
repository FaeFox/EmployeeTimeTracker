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
socket.on('alert_message', function(data) {
    showAlert(data.title, data.body, data.footer, data.category, data.start_date, data.end_date);
});

function showAlert(title, body, footer = null, type = "info", start_date = null, end_date = null) {
    Swal.fire({
        icon: type,
        title: title,
        html: body,
        footer: footer,
        didRender: () => {
            const btn = document.getElementById('copyReportBtn');
            const reportBox = document.getElementById('reportBox');

            if (btn && reportBox) {
                btn.addEventListener('click', () => {
                    const text = `Clock-ins from ${start_date} to ${end_date}:\n` + reportBox.innerText;
                    navigator.clipboard.writeText(text).then(() => {
                        // swap icon to checkmark
                        btn.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" fill="currentColor" class="bi bi-check" viewBox="0 0 16 12">
                                <path d="M13.485 1.929a.75.75 0 0 1 1.06 1.06l-8.25 8.25a.75.75 0 0 1-1.06 0l-4.25-4.25a.75.75 0 1 1 1.06-1.06L6 9.439l7.485-7.51z"/>
                            </svg>
                        `;
                        btn.title = 'Copied!';
                        // revert back after 1.5s
                        setTimeout(() => {
                            btn.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" fill="currentColor" class="bi bi-copy" viewBox="0 0 16 16">
                                <path fill-rule="evenodd" d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1z"/>
                            </svg>
                            `;
                            btn.title = 'Copy';
                        }, 1500);
                    });
                });
            }
        }
    });
}


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

// check if admin session is already verified
async function isAdminVerified() {
    try {
        const response = await fetch('/admin/is_admin_verified', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }

        const data = await response.json();
        const isValid = data.isValid;
        console.log('Admin verified:', isValid);
        return isValid;

    } catch (error) {
        console.error('Error checking admin session:', error);
        return false;
    }
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
                password: password,
                cookie: false
            }) // Use actual admin username
        })
        .then(response => response.json())
        .then(data => data.isValid);
}

function promptAdminVerification() {
    console.log("Initiating device authorization");

    const bootstrapAlert = Swal.mixin({
        customClass: {
            confirmButton: "btn btn-success ml-2",
            cancelButton: "btn btn-danger",
        },
        buttonsStyling: true,
    });

    return new Promise((resolve) => {
        bootstrapAlert.fire({
            title: "Verification Required",
            text: "You must verify your password before completing this action.",
            icon: "warning",
            input: 'password',
            inputPlaceholder: 'Enter your password',
            inputAttributes: {
                autocapitalize: 'off',
                autocorrect: 'off'
            },
            confirmButtonText: "Verify",
            cancelButtonText: "Cancel",
            showCancelButton: true,
            confirmButtonColor: "#3085d6",
            cancelButtonColor: "#d33",
        }).then((result) => {
            if (result.isConfirmed && result.value) {
                const password = result.value;
                verifyAdminPassword(password).then(isValid => {
                    if (isValid) {
                        showToast('success', 'Verification Successful');
                        resolve(true); // Authorization successful
                    } else {
                        showToast('error', 'Verification Failed');
                        resolve(false); // Authorization failed
                    }
                });
            } else {
                console.log("Device authorization cancelled");
                resolve(false); // Cancelled by user
            }
        });
    });
}


$(document).ready(function() {

    document.getElementById("editHoursButton").disabled = true;

    var table = $('#employee_list').DataTable({
        columns: [{
                title: 'Employee Name',
                data: 'name'
            },
            {
                title: 'Employee ID',
                data: 'id'
            },
            {
                title: 'Clock In',
                data: 'clock_in'
            },
            {
                title: 'Clock Out',
                data: 'clock_out'
            },
            {
                title: 'Hours Worked',
                data: 'hours_worked'
            },
            {
                title: "UUID",
                data: "uuid",
                visible: false
            }
        ]
    });

    function updateEmployeeHoursTable() {
        const employeeId = $('.employeeIdSelect').select2('data')[0] ? $('.employeeIdSelect').select2('data')[0].id : null;
        const startDate = $('#datePickerStart').val();
        const endDate = $('#datePickerTo').val();

        if (employeeId && startDate && endDate) {
            document.getElementById("editHoursButton").disabled = false;
            $.ajax({
                url: `/admin/get_employees_hours?user_id=${employeeId}&start_date=${startDate}&end_date=${endDate}`,
                type: 'GET',
                success: function(data) {
                    table.clear().rows.add(data).draw();
                    showToast('success', 'Employee hours updated successfully');
                },
                error: function(error) {
                    console.error('Error:', error);
                    showToast('error', 'Failed to update employee hours');
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

    $('#datePickerStart, #datePickerTo').change(fetchEmployeeHoursIfReady);

    function fetchEmployeeHoursIfReady() {
        updateEmployeeHoursTable();
    }

    $('.employeeIdSelect').select2({
        placeholder: "Select...",
        theme: 'bootstrap-5',
        width: '100%',
        ajax: {
            url: "/get_all_registered_employees",
            dataType: "json",
            processResults: function(data) {
                return {
                    results: data.results.map(item => ({
                        id: item.id,
                        text: item.text
                    }))
                };
            }
        }
    }).on('select2:select select2:unselect', fetchEmployeeHoursIfReady);

    $('#datePickerStart, #datePickerTo').change(fetchEmployeeHoursIfReady);

    function convertTo24Hour(dateTime) {
        // Extracting the date and time parts from the full dateTime string
        const [datePart, timePart, period] = dateTime.split(' ');
        const [month, day, year] = datePart.split('-');
        const [hour, minute, second] = timePart.split(':');

        // Convert the hour part based on the AM/PM value
        let formattedHour = parseInt(hour);
        if (period === 'PM' && formattedHour < 12) {
            formattedHour += 12;
        } else if (period === 'AM' && formattedHour === 12) {
            formattedHour = 0; // Midnight case
        }

        // Construct the ISO format date string for datetime-local input
        formattedHour = formattedHour.toString().padStart(2, '0'); // Ensure two digit format
        return `${year}-${month}-${day}T${formattedHour}:${minute}`;
    }

    $('#summarizeHoursButton').click(function(e) {
        e.preventDefault();

        const startDate = $('#datePickerStart').val();
        const endDate = $('#datePickerTo').val();

        if (startDate && endDate) {
            $.ajax({
                url: `/admin/get_hours_summary?start_date=${startDate}&end_date=${endDate}`,
                type: 'GET'
            });
        }

    });

$('#generateReportPDF').click(function(e) {

    e.preventDefault();

    const startDate = $('#datePickerStart').val();
    const endDate = $('#datePickerTo').val();
    const employeeData = $('.employeeIdSelect').select2('data')[0];
    const requesterName = $('#username').val();

    if (!employeeData) {
        showToast('warning', 'Please select an employee');
        return;
    }

    const empID = employeeData.id;

    const url =
        `/admin/print_employee_report?employee_id=${empID}&start_date=${startDate}&end_date=${endDate}&req_name=${requesterName}`;

    window.location.href = url;

});

    $('#editHoursButton').click(async function(e) {
        e.preventDefault();
        const alreadyVerified = await isAdminVerified();
        if (!alreadyVerified) {
            const authorized = await promptAdminVerification();
            if (!authorized) {
                return; // Exit if verification failed or cancelled
            }
        }

        if ($(this).text() === 'Modify Hours') {
            // Enable inputs for editing
            table.rows().every(function() {
                var rowData = this.data();
                if (!rowData.name.includes("Total Hours for")) {
                    var clockInVal = rowData.clock_in ? convertTo24Hour(rowData.clock_in) : '';
                    var clockOutVal = rowData.clock_out ? convertTo24Hour(rowData.clock_out) : '';

                    rowData.clock_in = `<input type="datetime-local" class="form-control clock-in-editor" value="${clockInVal}">`;
                    rowData.clock_out = `<input type="datetime-local" class="form-control clock-out-editor" value="${clockOutVal}">`;

                    this.invalidate();
                }
            });
            table.draw(false);
            $(this).text('Save');
        } else {
            // Save the changes
            var updatedRowsData = [];
            var isError = false;

            table.rows().every(function() {
                var rowData = this.data();
                if (!rowData.name.includes("Total Hours for")) {
                    var $rowNode = $(this.node());
                    var $clockInInput = $rowNode.find('.clock-in-editor');
                    var $clockOutInput = $rowNode.find('.clock-out-editor');

                    rowData.clock_in = $clockInInput.val().replace('T', ' ') + '.000000';
                    rowData.clock_out = $clockOutInput.val().replace('T', ' ') + '.000000';

                    updatedRowsData.push({
                        id: rowData.id,
                        uuid: rowData.uuid,
                        clock_in: rowData.clock_in,
                        clock_out: rowData.clock_out,
                        name: rowData.name
                    });
                }
            });

            if (!isError) {
                $.ajax({
                    url: '/api/update_employee_hours',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify(updatedRowsData),
                    success: function(response) {
                        updateEmployeeHoursTable(); // Refresh the table data
                        $('#editHoursButton').text('Modify Hours'); // Change button text back
                    },
                    error: function(error) {
                        console.error('Error updating hours:', error);
                    }
                });
            }
        }
    });
});
