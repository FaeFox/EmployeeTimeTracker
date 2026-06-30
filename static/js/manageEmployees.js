import { socket } from './socketClient.js';

socket.on('toast_message', function (data) {
    showToast(data.category, data.message);
});

function showToast(type = "success", message, duration = 3000) {
    const Toast = Swal.mixin({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: duration,
        timerProgressBar: true
    });

    Toast.fire({
        icon: type,
        title: message
    });
}

// ---------- Admin Verification ----------

async function isAdminVerified() {
    const response = await fetch('/admin/is_admin_verified', { method: 'POST' });
    const data = await response.json();
    return data.isValid;
}

async function verifyAdminPassword(password) {
    const username = document.getElementById("username").value;

    const response = await fetch('/admin/verify-admin-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, cookie: false })
    });

    const data = await response.json();
    return data.isValid;
}

async function promptAdminVerification(destructiveAction=false) {
    //var result;
    const result = await Swal.fire({
            title: "Verification Required",
            html: "Please verify your password to continue.",
            input: "password",
            inputPlaceholder: "Enter your password",
            showCancelButton: true,
            confirmButtonText: "Verify",
            icon: "warning"
    });
    //if (destructiveAction) {
    //    result = await Swal.fire({
    //        title: "Verification Required",
    //        html: "<strong>The action you are taking is potentially destructive. Please type your password to confirm.",
    //        input: "password",
    //        inputPlaceholder: "Enter your password",
    //        showCancelButton: true,
    //        confirmButtonText: "Verify",
    //        icon: "warning"
    //});
    //} else {
    //    result = await Swal.fire({
    //        title: "Verification Required",
    //        input: "password",
    //        inputPlaceholder: "Enter your password",
    //        showCancelButton: true,
    //        confirmButtonText: "Verify",
    //        icon: "warning"
    //    });
    //}

    if (!result.isConfirmed || !result.value) return false;

    const valid = await verifyAdminPassword(result.value);
    if (!valid) showToast("error", "Verification failed");

    return valid;
}

// ---------- Main ----------

$(document).ready(function () {

    const table = $('#employee_table').DataTable({
        ajax: {
            url: '/admin/get_all_employees_full',
            dataSrc: ''
        },
        columns: [
            { data: 'name' },
            { data: 'id' },
            {
                data: 'isAdmin',
                render: function (data) {
                    if (data) {
                        return '<span class="badge bg-danger">Admin</span>';
                    }
                    return '<span class="badge bg-secondary">User</span>';
                }
            },
            {
                data: null,
                render: function () {
                    return `
                        <button class="btn btn-sm btn-danger removeBtn">
                            Remove
                        </button>
                    `;
                }
            }
        ]
    });

    function reloadTable() {
        table.ajax.reload(null, false);
    }

    // ---------- Add Employee ----------

    $('#addEmployeeBtn').click(async function () {

    const name = $('#newEmployeeName').val().trim();
    const role = $('#newEmployeeRole').val();
    const isAdmin = role === 'admin';

    if (!name) {
        showToast("error", "Name required");
        return;
    }

    const verified = await isAdminVerified() || await promptAdminVerification();
    if (!verified) return;

    const response = await fetch('/admin/register_new_employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, isAdmin })
    });

    const data = await response.json();

    if (data.status === "success") {

        Swal.fire({
            icon: "success",
            title: "Employee Registered",
            html: `
                <b>Name:</b> ${name}<br>
                <b>ID:</b> ${data.employeeId}
            `
        });

        $('#newEmployeeName').val('');
        $('#newEmployeeRole').val('user');

        reloadTable();
    }
});

    // ---------- Remove Employee ----------

    $('#employee_table tbody').on('click', '.removeBtn', async function () {

        const rowData = table.row($(this).parents('tr')).data();
        const employeeId = rowData.id;

        const confirmed = await Swal.fire({
            title: "Remove Employee",
            html: `Are you sure you want to remove <strong>${rowData.name}</strong>?<br><br><strong>They will not be able to clock in, and you will no longer be able to view their hours worked after this operation.</strong>`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, remove"
        });

        if (!confirmed.isConfirmed) return;

        const verified = await isAdminVerified() || await promptAdminVerification();
        if (!verified) return;

        const response = await fetch('/admin/remove_employee', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employee_id: employeeId })
        });

        const data = await response.json();

        if (data.status === "success") {
            showToast("success", "Employee removed");
            reloadTable();
        } else {
            showToast("error", data.message);
        }
    });

});