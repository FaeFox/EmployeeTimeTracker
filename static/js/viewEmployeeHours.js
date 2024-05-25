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

    $('#editHoursButton').click(function(e) {
        e.preventDefault();

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
