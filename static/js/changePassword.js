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




function handleChangePasswordClick() {
    // Get values from input fields
    var apiUrl = "/api/update-password";
     // Get values from input fields
     var username = $("#username").val();
     var employeeId = $("#employee_id").val();
     var currentPassword = $("#currentPassword").val();
     var newPassword = $("#newPassword").val();
     var newPasswordRetype = $("#newPasswordRetype").val();

    // Verify if the two entered passwords match
    if (newPassword !== newPasswordRetype) {
      showToast("error", "The two passwords don't match.");
      return;
  }

  // Make the AJAX call to update the password in the backend
    $.ajax({
      type: "POST",
      url: apiUrl,
      contentType: "application/json",
      data: JSON.stringify({
        username: username,
        employeeId: employeeId,
        currentPassword: currentPassword,
        newPassword: newPassword,
      }),
      // Handle erver response
      success: function (response) {
        showToast("success", "Password updated successfully!");
      },
      error: function (error) {
        console.error("Error during the API call:", error);
        showToast("error", "An error occurred. Check if your current password is typed correctly, or try again later");
      },
    });
  }