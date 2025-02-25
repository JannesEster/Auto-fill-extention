document.addEventListener('DOMContentLoaded', function() {
    const emailContentTextarea = document.getElementById('emailContent');
    const extractButton = document.getElementById('extractButton');
    const fillFormButton = document.getElementById('fillFormButton');
    const statusDiv = document.getElementById('status');
    const extractedDataDiv = document.getElementById('extractedData');
    
    let extractedData = null;
    
    extractButton.addEventListener('click', function() {
      const emailContent = emailContentTextarea.value.trim();
      
      if (!emailContent) {
        showStatus('Please paste the email content first.', 'error');
        return;
      }
      
      try {
        extractedData = parseEmailContent(emailContent);
        
        // Display extracted data for review
        extractedDataDiv.innerHTML = '<h3>Extracted Data:</h3>';
        extractedDataDiv.innerHTML += '<pre>' + JSON.stringify(extractedData, null, 2) + '</pre>';
        extractedDataDiv.style.display = 'block';
        
        fillFormButton.disabled = false;
        showStatus('Data extracted successfully. Click "Fill Form" to autofill the booking form.', 'success');
      } catch (error) {
        showStatus('Error extracting data: ' + error.message, 'error');
        fillFormButton.disabled = true;
      }
    });
    
    fillFormButton.addEventListener('click', function() {
      if (!extractedData) {
        showStatus('Please extract data first.', 'error');
        return;
      }
      
      showStatus('Filling form...', 'success');
      
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        // Execute the fillForm script directly
        chrome.scripting.executeScript({
          target: {tabId: tabs[0].id},
          files: ['content.js']
        }, function() {
          // After ensuring content.js is loaded, send a message to that tab
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "fillForm", 
            data: extractedData
          }, function(result) {
            if (chrome.runtime.lastError) {
              console.error("Error:", chrome.runtime.lastError);
              showStatus('Error filling form: ' + chrome.runtime.lastError.message, 'error');
            } else if (result) {
              if (result.success) {
                showStatus('Form filled successfully!', 'success');
              } else {
                showStatus('Form filling completed with issues: ' + result.message, 'error');
              }
            } else {
              showStatus('No response from content script. Check the console for errors.', 'error');
            }
          });
        });
      });
    });
    
    function parseEmailContent(content) {
      const data = {};
      
      console.log("Parsing email content:", content);
      
      // Extract package info
      const packageMatch = content.match(/Package:\s*(.*?)(?:\n|$)/i);
      data.hasDjPackage = packageMatch && packageMatch[1].toLowerCase().includes('dj');
      
      // Extract date
      const dateMatch = content.match(/Date:\s*(.*?)(?:\n|$)/i);
      if (dateMatch && dateMatch[1].trim()) {
        // Convert date to format expected by the form (DD/MMM/YY)
        data.eventDate = formatDate(dateMatch[1].trim());
        console.log("Parsed date:", dateMatch[1].trim(), "→", data.eventDate);
        
        // Check if it's a Saturday booking
        try {
          let dateStr = dateMatch[1].trim();
          // Remove ordinal suffixes (1st, 2nd, 3rd, etc.)
          dateStr = dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1');
          
          let eventDate;
          // Try different date formats
          if (dateStr.includes('/')) {
            const parts = dateStr.split('/');
            // Try both MM/DD/YYYY and DD/MM/YYYY formats
            eventDate = new Date(parts[2], parts[1]-1, parts[0]); // DD/MM/YYYY
            if (isNaN(eventDate.getTime())) {
              eventDate = new Date(parts[2], parts[0]-1, parts[1]); // MM/DD/YYYY
            }
          } else {
            eventDate = new Date(dateStr);
          }
          
          if (!isNaN(eventDate.getTime())) {
            data.isSaturday = eventDate.getDay() === 6; // 6 is Saturday
            console.log("Date is a Saturday:", data.isSaturday);
          } else {
            console.log("Could not determine if date is a Saturday, defaulting to false");
            data.isSaturday = false;
          }
        } catch (e) {
          console.error("Error determining if date is Saturday:", e);
          data.isSaturday = false;
        }
      }
      
      // Extract start time
      const startTimeMatch = content.match(/Start time:\s*(.*?)(?:\n|$)/i);
      if (startTimeMatch) {
        data.startTime = startTimeMatch[1].trim();
        console.log("Parsed start time:", data.startTime);
      }
      
      // Calculate finish time and total hours (assuming 4 hours is standard)
      if (data.startTime) {
        data.totalHours = 4;
        data.finishTime = calculateFinishTime(data.startTime, data.totalHours);
        console.log("Calculated finish time:", data.finishTime);
      }
      
      // Extract room/venue
      const roomMatch = content.match(/Room:\s*(.*?)(?:\n|$)/i);
      if (roomMatch) {
        data.venue = roomMatch[1].trim();
        console.log("Parsed venue:", data.venue);
      }
      
      // Extract client name (school/company)
      const clientNameMatch = content.match(/Client names?:\s*(.*?)(?:\n|$)/i);
      if (clientNameMatch) {
        data.schoolCompany = clientNameMatch[1].trim();
        data.brideName = clientNameMatch[1].trim(); // Use same value for bride/person name field
        console.log("Parsed school/company:", data.schoolCompany);
      }
      
      // Extract contact email
      const emailMatch = content.match(/Client contact email:\s*(.*?)(?:\n|$)/i);
      if (emailMatch) {
        data.contactEmail = emailMatch[1].trim();
        console.log("Parsed contact email:", data.contactEmail);
        
        // Use the same email for the account contact if nothing else specified
        data.accountEmail = data.contactEmail;
      }
      
      // Extract contact phone
      const phoneMatch = content.match(/Client contact phone:\s*(.*?)(?:\n|$)/i);
      if (phoneMatch) {
        data.contactPhone = phoneMatch[1].trim();
        console.log("Parsed contact phone:", data.contactPhone);
      }
      
      // Set default values for fields not typically in email
      data.eventType = "Schools & Universities";
      data.createCustomerContact = true;
      
      // Try to be more flexible with parsing - look for keywords if standard patterns fail
      if (!data.venue) {
        // Try to find venue/location/place keywords
        const venueKeywords = ['venue:', 'location:', 'place:', 'at:', 'in:'];
        for (const keyword of venueKeywords) {
          const match = content.match(new RegExp(keyword + '\\s*(.*?)(?:\\n|$)', 'i'));
          if (match) {
            data.venue = match[1].trim();
            console.log("Found venue using keyword:", keyword, data.venue);
            break;
          }
        }
      }
      
      return data;
    }
    
    function formatDate(dateStr) {
      try {
        // Handle various date formats
        // 1. Convert any text month formats
        dateStr = dateStr.replace(/January|Jan/i, '01');
        dateStr = dateStr.replace(/February|Feb/i, '02');
        dateStr = dateStr.replace(/March|Mar/i, '03');
        dateStr = dateStr.replace(/April|Apr/i, '04');
        dateStr = dateStr.replace(/May/i, '05');
        dateStr = dateStr.replace(/June|Jun/i, '06');
        dateStr = dateStr.replace(/July|Jul/i, '07');
        dateStr = dateStr.replace(/August|Aug/i, '08');
        dateStr = dateStr.replace(/September|Sep/i, '09');
        dateStr = dateStr.replace(/October|Oct/i, '10');
        dateStr = dateStr.replace(/November|Nov/i, '11');
        dateStr = dateStr.replace(/December|Dec/i, '12');
        
        // Remove ordinal suffixes (1st, 2nd, 3rd, etc.)
        dateStr = dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1');
        
        // Parse date from various formats
        let date;
        if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}$/)) {
          // Format: DD/MM/YYYY or MM/DD/YYYY
          const parts = dateStr.split('/');
          if (parts[0] > 12) {
            date = new Date(`${parts[1]}/${parts[0]}/${parts[2]}`);
          } else {
            date = new Date(`${parts[0]}/${parts[1]}/${parts[2]}`);
          }
        } else if (dateStr.match(/^\d{1,2}-\d{1,2}-\d{2,4}$/)) {
          // Format: DD-MM-YYYY or MM-DD-YYYY
          const parts = dateStr.split('-');
          if (parts[0] > 12) {
            date = new Date(`${parts[1]}/${parts[0]}/${parts[2]}`);
          } else {
            date = new Date(`${parts[0]}/${parts[1]}/${parts[2]}`);
          }
        } else {
          // Try standard Date parsing
          date = new Date(dateStr);
        }
        
        if (isNaN(date.getTime())) {
          throw new Error("Invalid date");
        }
        
        // Format as DD/MMM/YY (05/Apr/25)
        const day = String(date.getDate()).padStart(2, '0');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = monthNames[date.getMonth()];
        const year = String(date.getFullYear()).slice(-2);
        
        return `${day}/${month}/${year}`;
      } catch (e) {
        console.error("Date parsing error:", e);
        return dateStr; // Return original if parsing fails
      }
    }
    
    function calculateFinishTime(startTime, hours) {
      try {
        // Parse the start time
        let timeStr = startTime.toLowerCase();
        const isPM = timeStr.includes('pm');
        timeStr = timeStr.replace(/[^0-9:]/g, '');
        
        let [hours24, minutes] = [0, 0];
        
        if (timeStr.includes(':')) {
          [hours24, minutes] = timeStr.split(':').map(Number);
        } else {
          hours24 = parseInt(timeStr);
          minutes = 0;
        }
        
        // Convert to 24-hour format if PM
        if (isPM && hours24 < 12) {
          hours24 += 12;
        }
        
        // Add the duration
        hours24 += hours;
        
        // Convert back to 12-hour format
        let finishHour = hours24 % 12;
        if (finishHour === 0) finishHour = 12;
        const finishAmPm = hours24 >= 12 ? 'pm' : 'am';
        
        return `${finishHour}:${String(minutes).padStart(2, '0')}${finishAmPm}`;
      } catch (e) {
        console.error("Time calculation error:", e);
        return ""; // Return empty if calculation fails
      }
    }
    
    function showStatus(message, type) {
      statusDiv.textContent = message;
      statusDiv.className = 'status ' + type;
    }
  });