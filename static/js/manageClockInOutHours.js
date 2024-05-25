function filterGlobal() {
    $("#employee_list").DataTable().search($("#global_filter").val()).draw();
  }
  
  let tableVisualizationMode = "perEmployee";
  
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
  
  function filterColumn(i) {
    $("#employee_list")
      .DataTable()
      .column(i)
      .search($("#col" + i + "_filter").val())
      .draw();
  }
  
  $(document).ready(function () {
    // Employee select2
    let employeeSelect = $(".employeeIdSelect").select2({
      placeholder: "Select...",
      allowClear: true,
      theme: "bootstrap-5",
      width: "100%",
      ajax: {
        url: "/get_all_registered_employees", // Path to your Flask route
        dataType: "json",
        delay: 250,
        processResults: function (data) {
          return {
            results: data.results,
          };
        },
        cache: true,
      },
    });
  
    let table = $("#employee_list").DataTable({
      language: {
        emptyTable: "No data. Select an employee from the dropdown above to start searching.",
      },
      ajax: {
        url: "/get_employee_records/none",
        dataSrc: "",
      },
      initComplete: function () {
        console.log("hello");
        // Add the buttons to the datatable container
        table
          .buttons()
          .container()
          .appendTo("#employeeRecords_wrapper  .col-md-6:eq(0)");
      },
      columns: [
        {
          data: "name",
          render: function (data) {
            var currentSelectData = $(".employeeIdSelect").select2("data");
  
            if (
              currentSelectData.length != 0 &&
              tableVisualizationMode == "perEmployee"
            ) {
              return currentSelectData[0].text
                .match(/^(.*?)\s*\(\d+\)$/)[1]
                .trim();
            } else if (tableVisualizationMode == "allEmployees") {
              return data;
            }
          },
        },
        {
          data: "id",
          render: function (data) {
            var currentSelectData = $(".employeeIdSelect").select2("data");
  
            if (
              currentSelectData.length != 0 &&
              tableVisualizationMode == "perEmployee"
            ) {
              return currentSelectData[0].text.match(/\((\d+)\)/)[1];
            } else if (tableVisualizationMode == "allEmployees") {
              return data;
            }
          },
        },
        {
          data: "clock_in",
          render: function (data) {
            if (data == "" || data == null || data == undefined) {
              return "";
            } else {
              return formatTimestamp(data);
            }
          },
        },
        {
          data: "clock_out",
          render: function (data) {
            // console.log(data)
            if (data == "" || data == null || data == undefined) {
              return "";
            } else {
              return formatTimestamp(data);
            }
          },
        },
        {
          data: null,
          render: function (data) {
            return "";
          },
        },
      ],
      // columnDefs: [
      //   { width: "10%", targets: 4},
      // ],
      dom: "Bfrtip",
      buttons: [
        {
          extend: "pdfHtml5",
          title: "Check in/out history of Toori",
          exportOptions: {
            columns: ":visible:not(.no-export)",
          },
        },
        {
          extend: "excelHtml5",
          title: "Check in/out history of Toori",
          exportOptions: {
            columns: ":visible:not(.no-export)",
          },
        },
      ],
    });
  
    var checkbox = document.getElementById("flexSwitchCheckDefault");
  
    checkbox.addEventListener("change", function () {
      if (checkbox.checked) {
        Swal.fire({
          title: "Are you sure you want to load all employees data?",
          text: "Depending on the number of employees, this operation could take a bit of time",
          icon: "warning",
          showCancelButton: true,
          confirmButtonColor: "#3085d6",
          cancelButtonColor: "#d33",
          confirmButtonText: "Yes",
        }).then((result) => {
          if (result.isConfirmed) {
            tableVisualizationMode = "allEmployees";
            table.ajax.url("/admin/get_employees_list").load();
            $(".employeeIdSelect").val("").trigger("change");
            $(".employeeIdSelect").prop("disabled", true);
          } else if (result.dismiss === Swal.DismissReason.cancel) {
            tableVisualizationMode = "perEmployee";
            table.ajax.url("/get_employee_records/none").load();
            checkbox.checked = false;
            $(".employeeIdSelect").val("").trigger("change");
            $(".employeeIdSelect").prop("disabled", false);
          }
        });
      } else {
        $(".employeeIdSelect").val("").trigger("change");
        $(".employeeIdSelect").prop("disabled", false);
        tableVisualizationMode = "perEmployee";
        table.ajax.url("/get_employee_records/none").load();
      }
    });
  
    // Add a listener for the Select2 change
    employeeSelect.on("select2:select", function (e) {
      let selectedEmployeeId = e.params.data.text.match(/\((\d+)\)/)[1];
  
      // Update the DataTable URL with the selected employee's ID
      table.ajax.url(`/get_employee_records/${selectedEmployeeId}`).load();
    });
  
    // Custom filtering function which will search data in column four between two values
    $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
      var minStr = $("#datePickerStart")
        .data("datepicker")
        .getFormattedDate("mm/dd/yyyy");
      var maxStr = $("#datePickerTo")
        .data("datepicker")
        .getFormattedDate("mm/dd/yyyy");
      let min = moment(minStr).isValid()
        ? new Date(minStr).setUTCHours(0, 0, 0, 0)
        : null;
  
      let max = moment(maxStr).isValid()
        ? new Date(maxStr).setUTCHours(23, 59, 59, 999)
        : null;
      var date = new Date(data[3]);
  
      if (
        (min === null && max === null) ||
        (min === null && date <= max) ||
        (min <= date && max === null) ||
        (min <= date && date <= max)
      ) {
        return true;
      }
      return false;
    });
  
    var dtButtons = document.querySelectorAll(".dt-button");
  
    // Iterate over each element and add the classes "btn" and "btn-primary"
    dtButtons.forEach(function (element) {
      element.classList.add("btn", "btn-secondary");
    });
  
    $("#datePickerStart")
      .datepicker({
        format: "mm/dd/yyyy",
        todayHighlight: true,
      })
      .on("changeDate", function () {
        table.draw(); // Use the draw() function to recalculate and redraw the table
      });
  
    $("#datePickerTo")
      .datepicker({
        format: "mm/dd/yyyy",
        todayHighlight: true,
      })
      .on("changeDate", function () {
        table.draw(); // Use the draw() function to recalculate and redraw the table
      });
  
    $("input.column_filter").on("keyup click", function () {
      filterColumn($(this).parents("div").attr("data-column"));
    });
  });
  
  $("select.column_filter").on("change", function () {
    filterColumn($(this).parents("div").attr("data-column"));
  });
  