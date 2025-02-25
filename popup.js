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
      
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.scripting.executeScript({
          target: {tabId: tabs[0].id},
          function: fillForm,
          args: [extractedData]
        }, function(results) {
          if (chrome.runtime.lastError) {
            showStatus('Error filling form: ' + chrome.runtime.lastError.message, 'error');
          } else {
            showStatus('Form filled successfully!', 'success');
          }
        });
      });
    });
    
    function parseEmailContent(content) {
      const data = {};
      
      // Extract package info
      const packageMatch = content.match(/Package:\s*(.*?)(?:\n|$)/i);
      data.hasDjPackage = packageMatch && packageMatch[1].toLowerCase().includes('dj');
      
      // Extract date
      const dateMatch = content.match(/Date:\s*(.*?)(?:\n|$)/i);
      if (dateMatch && dateMatch[1].trim()) {
        // Convert date to format expected by the form (DD/MMM/YY)
        data.eventDate = formatDate(dateMatch[1].trim());
        
        // Check if it's a Saturday booking
        const eventDate = new Date(dateMatch[1].replace(/(\d+)(st|nd|rd|th)/, '$1'));
        data.isSaturday = eventDate.getDay() === 6; // 6 is Saturday
      }
      
      // Extract start time
      const startTimeMatch = content.match(/Start time:\s*(.*?)(?:\n|$)/i);
      if (startTimeMatch) {
        data.startTime = startTimeMatch[1].trim();
      }
      
      // Calculate finish time and total hours (assuming 4 hours is standard)
      if (data.startTime) {
        data.totalHours = 4;
        data.finishTime = calculateFinishTime(data.startTime, data.totalHours);
      }
      
      // Extract room/venue
      const roomMatch = content.match(/Room:\s*(.*?)(?:\n|$)/i);
      if (roomMatch) {
        data.venue = roomMatch[1].trim();
      }
      
      // Extract client name (school/company)
      const clientNameMatch = content.match(/Client names:\s*(.*?)(?:\n|$)/i);
      if (clientNameMatch) {
        data.schoolCompany = clientNameMatch[1].trim();
      }
      
      // Extract contact email
      const emailMatch = content.match(/Client contact email:\s*(.*?)(?:\n|$)/i);
      if (emailMatch) {
        data.contactEmail = emailMatch[1].trim();
        
        // Use the same email for the account contact if nothing else specified
        data.accountEmail = data.contactEmail;
      }
      
      // Extract contact phone
      const phoneMatch = content.match(/Client contact phone:\s*(.*?)(?:\n|$)/i);
      if (phoneMatch) {
        data.contactPhone = phoneMatch[1].trim();
      }
      
      // Set default values for fields not typically in email
      data.eventType = "Schools & Universities";
      data.createCustomerContact = true;
      
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
  
  // This function runs in the context of the web page
  function fillForm(data) {
    try {
      // Account details
      fillInputByLabel("Account point of contact", "May");
      fillInputByLabel("Account contact email", data.accountEmail || "");
      
      // Event details
      fillInputByLabel("Event date", data.eventDate || "");
      fillSelectByLabel("Event type", data.eventType || "Schools & Universities");
      
      // Saturday booking
      if (data.isSaturday !== undefined) {
        const yesRadio = document.querySelector('input[type="radio"][value="Yes"]');
        const noRadio = document.querySelector('input[type="radio"][value="No"]');
        
        if (data.isSaturday && yesRadio) {
          yesRadio.checked = true;
        } else if (noRadio) {
          noRadio.checked = true;
        }
      }
      
      // Create customer contact
      clickYesNoOption("Create customer contact", data.createCustomerContact || true);
      
      // DJ package
      clickYesNoOption("Order contains DJ package", data.hasDjPackage || true);
      
      // School/company
      fillInputByLabel("School/company", data.schoolCompany || "");
      
      // Client contact details
      fillInputByLabel("Customer best contact email", data.contactEmail || "");
      fillInputByLabel("Customer contact phone", data.contactPhone || "");
      
      // Venue
      fillInputByLabel("Venue (room)", data.venue || "");
      
      // Times
      fillInputByLabel("Start time", data.startTime || "");
      fillInputByLabel("Finish time", data.finishTime || "");
      
      // DJ hours
      fillInputByLabel("DJ Total hours", data.totalHours || "4");
      
      return {success: true, message: "Form filled successfully"};
    } catch (error) {
      console.error("Error filling form:", error);
      return {success: false, message: error.message};
    }
    
    // Helper functions for filling form fields
    function fillInputByLabel(labelText, value) {
      try {
        // Try to find the label element
        const labels = Array.from(document.querySelectorAll('label')).filter(
          label => label.textContent.trim().includes(labelText)
        );
        
        let input;
        
        if (labels.length > 0) {
          // Get the associated input if label exists
          const label = labels[0];
          const forId = label.getAttribute('for');
          
          if (forId) {
            input = document.getElementById(forId);
          } else {
            input = label.querySelector('input, textarea, select');
          }
        } else {
          // Try to find by placeholder or nearby text
          const placeholderInput = Array.from(document.querySelectorAll('input, textarea')).find(
            el => el.placeholder && el.placeholder.includes(labelText)
          );
          
          if (placeholderInput) {
            input = placeholderInput;
          } else {
            // Look for text nodes containing the label text
            const textNodes = [];
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
              null,
              false
            );
            
            let node;
            while ((node = walker.nextNode())) {
              if (node.nodeValue.trim().includes(labelText)) {
                textNodes.push(node);
              }
            }
            
            // Find the closest input to the text node
            if (textNodes.length > 0) {
              let closestDistance = Infinity;
              let closestInput = null;
              
              textNodes.forEach(textNode => {
                const inputs = document.querySelectorAll('input, textarea, select');
                inputs.forEach(inp => {
                  const distance = getNodeDistance(textNode, inp);
                  if (distance < closestDistance) {
                    closestDistance = distance;
                    closestInput = inp;
                  }
                });
              });
              
              if (closestInput) {
                input = closestInput;
              }
            }
          }
        }
        
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        
        return false;
      } catch (e) {
        console.error(`Error filling input for "${labelText}":`, e);
        return false;
      }
    }
    
    function fillSelectByLabel(labelText, value) {
      try {
        // Find the select element similar to how we find input fields
        const labels = Array.from(document.querySelectorAll('label')).filter(
          label => label.textContent.trim().includes(labelText)
        );
        
        let select;
        
        if (labels.length > 0) {
          const label = labels[0];
          const forId = label.getAttribute('for');
          
          if (forId) {
            select = document.getElementById(forId);
          } else {
            select = label.querySelector('select');
          }
        } else {
          // Try to find by nearby text
          const textNodes = [];
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null,
            false
          );
          
          let node;
          while ((node = walker.nextNode())) {
            if (node.nodeValue.trim().includes(labelText)) {
              textNodes.push(node);
            }
          }
          
          if (textNodes.length > 0) {
            let closestDistance = Infinity;
            let closestSelect = null;
            
            textNodes.forEach(textNode => {
              const selects = document.querySelectorAll('select');
              selects.forEach(sel => {
                const distance = getNodeDistance(textNode, sel);
                if (distance < closestDistance) {
                  closestDistance = distance;
                  closestSelect = sel;
                }
              });
            });
            
            if (closestSelect) {
              select = closestSelect;
            }
          }
        }
        
        if (select) {
          for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].text.includes(value)) {
              select.selectedIndex = i;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
        }
        
        return false;
      } catch (e) {
        console.error(`Error filling select for "${labelText}":`, e);
        return false;
      }
    }
    
    function clickYesNoOption(labelText, value) {
      try {
        // Find the group of radio buttons or yes/no options
        const labels = Array.from(document.querySelectorAll('label, div, span')).filter(
          el => el.textContent.trim().includes(labelText)
        );
        
        if (labels.length > 0) {
          // Look for the parent container
          const container = findParentContainer(labels[0]);
          
          if (container) {
            // Find Y/N, Yes/No, or similar radio buttons
            const options = container.querySelectorAll('input[type="radio"]');
            
            // Find Y or Yes option
            const yesOption = Array.from(options).find(opt => {
              const label = document.querySelector(`label[for="${opt.id}"]`);
              const optionText = label ? label.textContent.trim() : '';
              return optionText === 'Y' || optionText === 'Yes' || optionText === 'yes' || opt.value === 'Y' || opt.value === 'Yes';
            });
            
            // Find N or No option
            const noOption = Array.from(options).find(opt => {
              const label = document.querySelector(`label[for="${opt.id}"]`);
              const optionText = label ? label.textContent.trim() : '';
              return optionText === 'N' || optionText === 'No' || optionText === 'no' || opt.value === 'N' || opt.value === 'No';
            });
            
            if (value && yesOption) {
              yesOption.checked = true;
              yesOption.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            } else if (!value && noOption) {
              noOption.checked = true;
              noOption.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
        }
        
        return false;
      } catch (e) {
        console.error(`Error clicking option for "${labelText}":`, e);
        return false;
      }
    }
    
    function findParentContainer(element) {
      // Try to find a parent element that might contain the radio buttons
      let current = element;
      let depth = 0;
      const maxDepth = 5; // Limit search depth
      
      while (current && depth < maxDepth) {
        // Check if this parent contains radio buttons
        if (current.querySelectorAll('input[type="radio"]').length > 0) {
          return current;
        }
        
        current = current.parentElement;
        depth++;
      }
      
      // If no suitable parent found, return the parent element anyways
      return element.parentElement;
    }
    
    function getNodeDistance(node1, node2) {
      // Simple function to estimate visual distance between nodes
      const rect1 = getNodeRect(node1);
      const rect2 = getNodeRect(node2);
      
      const dx = rect1.left - rect2.left;
      const dy = rect1.top - rect2.top;
      
      return Math.sqrt(dx*dx + dy*dy);
    }
    
    function getNodeRect(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const range = document.createRange();
        range.selectNodeContents(node);
        return range.getBoundingClientRect();
      } else {
        return node.getBoundingClientRect();
      }
    }
  }