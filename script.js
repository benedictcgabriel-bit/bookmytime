/**
 * BookMyTime: Appointment Booking System
 * Handles page view routing (Book vs My Appointments), validation,
 * slot availability, atomic persistence, and cancellation.
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Central Schedule Configuration
  // ---------------------------------------------------------------------------
  const SCHEDULE_CONFIG = {
    businessDays: [1, 2, 3, 4, 5, 6], // 1=Mon, ..., 6=Sat (0=Sun closed)
    businessDaysNames: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    openTime: '09:00',
    closeTime: '17:00',
    slotDurationMinutes: 30,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time'
  };

  // ---------------------------------------------------------------------------
  // Application State
  // ---------------------------------------------------------------------------
  const state = {
    currentPage: 'book', // 'book' | 'appointments'
    persistenceMode: 'checking',
    appointments: [],
    selectedDate: '',
    selectedTime: '',
    currentTab: 'upcoming', // 'upcoming' | 'all'
    isSubmitting: false,
    cancellingAppointment: null
  };

  // ---------------------------------------------------------------------------
  // DOM Elements Cache
  // ---------------------------------------------------------------------------
  const elements = {
    // Navigation & Views
    navBook: document.getElementById('nav-book'),
    navAppointments: document.getElementById('nav-appointments'),
    navBadge: document.getElementById('nav-badge'),
    brandLink: document.getElementById('brand-link'),
    bookPage: document.getElementById('book-page'),
    appointmentsPage: document.getElementById('appointments-page'),
    btnBackToBooking: document.getElementById('btn-back-to-booking'),

    // Booking Form
    form: document.getElementById('booking-form'),
    fullName: document.getElementById('fullName'),
    email: document.getElementById('email'),
    phone: document.getElementById('phone'),
    date: document.getElementById('date'),
    appointmentType: document.getElementById('appointment-type'),
    typeError: document.getElementById('type-error'),
    customTypeGroup: document.getElementById('custom-type-group'),
    customType: document.getElementById('custom-type'),
    customTypeError: document.getElementById('custom-type-error'),
    selectedTimeInput: document.getElementById('selected-time'),
    notes: document.getElementById('notes'),
    notesCounter: document.getElementById('notes-counter'),
    submitBtn: document.getElementById('submit-btn'),
    submitSpinner: document.getElementById('submit-spinner'),
    submitText: document.getElementById('submit-text'),

    // Alert Banner
    banner: document.getElementById('form-banner'),
    alertTitle: document.getElementById('alert-title'),
    alertMessage: document.getElementById('alert-message'),
    btnCloseBanner: document.getElementById('btn-close-banner'),

    // Slots Picker
    slotsContainer: document.getElementById('slots-container'),
    slotsStatus: document.getElementById('slots-status'),
    selectedSlotPill: document.getElementById('selected-slot-pill'),
    selectedSlotText: document.getElementById('selected-slot-text'),
    tzInfo: document.getElementById('tz-info'),

    // Validation Errors
    nameError: document.getElementById('name-error'),
    emailError: document.getElementById('email-error'),
    phoneError: document.getElementById('phone-error'),
    dateError: document.getElementById('date-error'),
    timeError: document.getElementById('time-error'),

    // Appointments Page
    appointmentsList: document.getElementById('appointments-list'),
    tabUpcoming: document.getElementById('tab-upcoming'),
    tabAll: document.getElementById('tab-all'),
    countUpcoming: document.getElementById('count-upcoming'),
    countAll: document.getElementById('count-all'),
    btnRefresh: document.getElementById('btn-refresh'),

    // Storage Status & Undo
    storageIndicator: document.getElementById('storage-indicator'),
    storageModeText: document.getElementById('storage-mode-text'),
    footerStorageNote: document.getElementById('footer-storage-note'),
    btnUndoStep: document.getElementById('btn-undo-step'),
    btnFormUndo: document.getElementById('btn-form-undo'),
    liveAnnouncer: document.getElementById('live-announcer'),

    // Notifications Center & Floating Box (Top Right)
    notificationWrapper: document.getElementById('notification-wrapper'),
    btnNotificationBox: document.getElementById('btn-notification-box'),
    notificationNumberBadge: document.getElementById('notification-number-badge'),
    notificationFloatingBox: document.getElementById('notification-floating-box'),
    floatingUnreadCount: document.getElementById('floating-unread-count'),
    btnClearAllNotifications: document.getElementById('btn-clear-all-notifications'),
    btnCloseFloatingBox: document.getElementById('btn-close-floating-box'),
    notificationFloatingContent: document.getElementById('notification-floating-content'),
    notificationItemsList: document.getElementById('notification-items-list'),
    notificationEmptyState: document.getElementById('notification-empty-state'),

    // Cancellation Modal
    cancelDialog: document.getElementById('cancel-dialog'),
    modalRef: document.getElementById('modal-ref'),
    modalDatetime: document.getElementById('modal-datetime'),
    modalName: document.getElementById('modal-name'),
    modalKeepBtn: document.getElementById('modal-keep-btn'),
    modalConfirmBtn: document.getElementById('modal-confirm-btn'),
    modalSpinner: document.getElementById('modal-spinner'),
    modalError: document.getElementById('modal-error')
  };

  // ---------------------------------------------------------------------------
  // Accessibility Announcer
  // ---------------------------------------------------------------------------
  function announce(message) {
    if (elements.liveAnnouncer) {
      elements.liveAnnouncer.textContent = '';
      setTimeout(() => {
        elements.liveAnnouncer.textContent = message;
      }, 50);
    }
  }

  // ---------------------------------------------------------------------------
  // Page View Switcher
  // ---------------------------------------------------------------------------
  function switchPage(pageName) {
    state.currentPage = pageName;

    if (pageName === 'appointments') {
      elements.bookPage.classList.remove('active');
      elements.bookPage.hidden = true;

      elements.appointmentsPage.classList.add('active');
      elements.appointmentsPage.hidden = false;

      elements.navBook.classList.remove('active');
      elements.navAppointments.classList.add('active');

      window.location.hash = '#appointments';
      renderAppointmentsList();
      announce('Viewing My Appointments');
    } else {
      elements.appointmentsPage.classList.remove('active');
      elements.appointmentsPage.hidden = true;

      elements.bookPage.classList.add('active');
      elements.bookPage.hidden = false;

      elements.navAppointments.classList.remove('active');
      elements.navBook.classList.add('active');

      window.location.hash = '#book';
      renderTimeSlots();
      announce('Viewing Book Appointment');
    }
  }

  // ---------------------------------------------------------------------------
  // Date & Time Formatting Utilities
  // ---------------------------------------------------------------------------
  function getTodayString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function formatDisplayTime(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':').map(Number);
    const dateObj = new Date();
    dateObj.setHours(h, m, 0, 0);
    return dateObj.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  function getSlotEndTime(timeStr, durationMin = 30) {
    const [h, m] = timeStr.split(':').map(Number);
    let total = h * 60 + m + durationMin;
    const endH = Math.floor(total / 60);
    const endM = total % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  }

  function maskPhone(phone) {
    if (!phone) return '';
    const clean = phone.trim();
    if (clean.length <= 4) return clean;
    const visiblePart = clean.slice(-4);
    const hiddenPart = clean.slice(0, -4).replace(/[0-9]/g, '*');
    return hiddenPart + visiblePart;
  }

  function generateConfigSlots() {
    const [openH, openM] = SCHEDULE_CONFIG.openTime.split(':').map(Number);
    const [closeH, closeM] = SCHEDULE_CONFIG.closeTime.split(':').map(Number);
    const step = SCHEDULE_CONFIG.slotDurationMinutes;
    
    let curr = openH * 60 + openM;
    const end = closeH * 60 + closeM;
    const slots = [];

    while (curr + step <= end) {
      const h = Math.floor(curr / 60);
      const m = curr % 60;
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      curr += step;
    }
    return slots;
  }

  const ALL_SLOTS = generateConfigSlots();

  // ---------------------------------------------------------------------------
  // Persistence Layer
  // ---------------------------------------------------------------------------
  const StorageService = {
    LOCAL_KEY: 'bookmytime_appointments_data',

    async init() {
      try {
        const res = await fetch('/api/config', { method: 'GET' });
        if (res.ok) {
          const data = await res.json();
          if (data.persistence === 'sqlite') {
            state.persistenceMode = 'sqlite';
            this.updateBadge('sqlite');
            return;
          }
        }
      } catch (e) {
        // Fallback to LocalStorage
      }
      state.persistenceMode = 'localstorage';
      this.updateBadge('localstorage');
    },

    updateBadge(mode) {
      if (elements.storageIndicator) {
        elements.storageIndicator.hidden = true;
      }
      if (elements.footerStorageNote) {
        elements.footerStorageNote.textContent = '';
      }
    },

    async fetchAppointments() {
      if (state.persistenceMode === 'sqlite') {
        const res = await fetch('/api/appointments', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load appointments from server');
        const data = await res.json();
        return data.appointments || [];
      } else {
        const raw = localStorage.getItem(this.LOCAL_KEY);
        try {
          return raw ? JSON.parse(raw) : [];
        } catch (e) {
          return [];
        }
      }
    },

    async createBooking(payload) {
      if (state.persistenceMode === 'sqlite') {
        const res = await fetch('/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.status === 409) {
          const err = new Error(data.message || 'Slot conflict');
          err.isConflict = true;
          throw err;
        }
        if (!res.ok) {
          const err = new Error(data.error || 'Failed to create booking');
          err.fieldErrors = data.fieldErrors;
          throw err;
        }
        return data.appointment;
      } else {
        const list = await this.fetchAppointments();
        const existing = list.find(a => a.date === payload.date && a.startTime === payload.startTime && a.status === 'booked');
        if (existing) {
          const err = new Error('This slot was just booked by another user. Please choose another time.');
          err.isConflict = true;
          throw err;
        }

        const newId = 'local-' + Math.random().toString(36).substring(2, 9) + Date.now();
        const ref = 'BK-' + new Date().getFullYear() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        const record = {
          id: newId,
          reference: ref,
          fullName: payload.fullName,
          email: payload.email,
          phone: payload.phone,
          date: payload.date,
          startTime: payload.startTime,
          appointmentType: payload.appointmentType || 'General',
          notes: payload.notes || '',
          status: 'booked',
          createdAt: new Date().toISOString(),
          cancelledAt: null
        };

        list.push(record);
        localStorage.setItem(this.LOCAL_KEY, JSON.stringify(list));
        return record;
      }
    },

    async cancelBooking(id) {
      if (state.persistenceMode === 'sqlite') {
        const res = await fetch(`/api/appointments/${encodeURIComponent(id)}/cancel`, {
          method: 'POST'
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || data.error || 'Failed to cancel appointment');
        }
        return data.appointment;
      } else {
        const list = await this.fetchAppointments();
        const index = list.findIndex(a => a.id === id);
        if (index === -1) {
          throw new Error('Appointment not found');
        }
        if (list[index].status === 'cancelled') {
          throw new Error('This appointment has already been cancelled.');
        }

        list[index].status = 'cancelled';
        list[index].cancelledAt = new Date().toISOString();
        localStorage.setItem(this.LOCAL_KEY, JSON.stringify(list));
        return list[index];
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Validation Rules
  // ---------------------------------------------------------------------------
  function validateFullName(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      return 'Full name is required.';
    }
    const nonWhitespace = trimmed.replace(/\s+/g, '');
    if (nonWhitespace.length < 2) {
      return 'Full name must contain at least 2 non-whitespace characters.';
    }
    if (!/^[A-Za-z\s'\-]+$/.test(trimmed)) {
      return 'Full name may only contain letters, spaces, hyphens, and apostrophes.';
    }
    return '';
  }

  function validateEmail(email) {
    const raw = (email || '').trim();
    if (!raw) {
      return 'Email address is required.';
    }
    // Uppercase letters are rejected with 'Invalid Email ID'
    if (/[A-Z]/.test(raw)) {
      return 'Invalid Email ID';
    }
    // Must be a valid email ending with @gmail.com
    const gmailRegex = /^[a-z0-9._%+-]+@gmail\.com$/;
    if (!gmailRegex.test(raw)) {
      return 'Invalid Email ID';
    }
    return '';
  }

  function validatePhone(phone) {
    const trimmed = (phone || '').trim();
    if (!trimmed || trimmed === '+91') {
      return 'Phone number is required.';
    }
    const digits = trimmed.replace(/\D/g, '');
    // Standard Indian phone format: 10 digits or 12 digits (+91 98765 43210)
    if (digits.length === 10 || (digits.length === 12 && digits.startsWith('91'))) {
      return '';
    }
    if (digits.length < 10 || digits.length > 15) {
      return 'Please enter a valid 10-digit Indian mobile number (+91).';
    }
    if (!/^\+?[\d\s\-\(\)\.]{7,25}$/.test(trimmed)) {
      return 'Phone number contains invalid formatting characters.';
    }
    return '';
  }

  function validateDate(dateStr) {
    if (!dateStr) {
      return 'Please select an appointment date.';
    }
    const [y, m, d] = dateStr.split('-').map(Number);
    const selected = new Date(y, m - 1, d);
    const todayStr = getTodayString();
    const [ty, tm, td] = todayStr.split('-').map(Number);
    const today = new Date(ty, tm - 1, td);

    if (selected < today) {
      return 'Past dates cannot be selected.';
    }

    const dayOfWeek = selected.getDay();
    if (dayOfWeek === 0) {
      return 'We are closed on Sundays. Please select Monday through Saturday.';
    }

    return '';
  }

  function validateAppointmentType(type, customVal) {
    if (!type) {
      return 'Please select the type of appointment.';
    }
    if (type === 'Others') {
      const trimmedCustom = (customVal || '').trim();
      if (!trimmedCustom) {
        return 'Please specify your appointment type.';
      }
      if (trimmedCustom.length < 2) {
        return 'Appointment type must contain at least 2 characters.';
      }
    }
    return '';
  }

  function getEffectiveAppointmentType() {
    const rawType = elements.appointmentType ? elements.appointmentType.value : '';
    if (rawType === 'Others') {
      return elements.customType ? elements.customType.value.trim() : 'Others';
    }
    return rawType || 'General';
  }

  function validateTime(timeStr, dateStr) {
    if (!timeStr) {
      return 'Please select an available time slot.';
    }
    if (!ALL_SLOTS.includes(timeStr)) {
      return 'Selected time slot is outside opening hours.';
    }

    const todayStr = getTodayString();
    if (dateStr === todayStr) {
      const now = new Date();
      const [h, m] = timeStr.split(':').map(Number);
      const slotTime = new Date();
      slotTime.setHours(h, m, 0, 0);

      if (slotTime <= now) {
        return 'This time slot has already passed for today.';
      }
    }

    const isBooked = state.appointments.some(
      a => a.date === dateStr && a.startTime === timeStr && a.status === 'booked'
    );
    if (isBooked) {
      return 'This time slot is already booked.';
    }

    return '';
  }

  function setFieldError(fieldInput, errorElement, errorMessage) {
    if (errorMessage) {
      if (fieldInput) fieldInput.classList.add('is-invalid');
      errorElement.textContent = errorMessage;
      errorElement.classList.add('visible');
    } else {
      if (fieldInput) fieldInput.classList.remove('is-invalid');
      errorElement.textContent = '';
      errorElement.classList.remove('visible');
    }
  }

  // ---------------------------------------------------------------------------
  // Time Slots Rendering
  // ---------------------------------------------------------------------------
  function renderTimeSlots() {
    const dateVal = elements.date.value;
    state.selectedDate = dateVal;

    elements.slotsContainer.innerHTML = '';
    elements.timeError.textContent = '';
    elements.timeError.classList.remove('visible');

    if (!dateVal) {
      elements.slotsContainer.hidden = true;
      elements.slotsStatus.hidden = false;
      elements.slotsStatus.textContent = 'Pick a date above to display available times.';
      elements.selectedSlotPill.hidden = true;
      elements.selectedTimeInput.value = '';
      state.selectedTime = '';
      return;
    }

    const dateErr = validateDate(dateVal);
    if (dateErr) {
      elements.slotsContainer.hidden = true;
      elements.slotsStatus.hidden = false;
      elements.slotsStatus.textContent = dateErr;
      elements.selectedSlotPill.hidden = true;
      elements.selectedTimeInput.value = '';
      state.selectedTime = '';
      return;
    }

    elements.slotsStatus.hidden = true;
    elements.slotsContainer.hidden = false;

    const todayStr = getTodayString();
    const isToday = dateVal === todayStr;
    const now = new Date();

    const bookedTimes = new Set(
      state.appointments
        .filter(a => a.date === dateVal && a.status === 'booked')
        .map(a => a.startTime)
    );

    let availableCount = 0;

    ALL_SLOTS.forEach(slot => {
      let isPassed = false;
      if (isToday) {
        const [h, m] = slot.split(':').map(Number);
        const slotDate = new Date();
        slotDate.setHours(h, m, 0, 0);
        if (slotDate <= now) {
          isPassed = true;
        }
      }

      const isBooked = bookedTimes.has(slot);
      const isUnavailable = isPassed || isBooked;

      if (!isUnavailable) {
        availableCount++;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-btn';
      btn.dataset.time = slot;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', state.selectedTime === slot ? 'true' : 'false');

      const timeSpan = document.createElement('span');
      timeSpan.className = 'slot-time';
      timeSpan.textContent = formatDisplayTime(slot);

      const statusSpan = document.createElement('span');
      statusSpan.className = 'slot-status-label';

      if (isBooked) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        btn.setAttribute('aria-label', `${formatDisplayTime(slot)}, Booked`);
        statusSpan.textContent = 'Booked';
      } else if (isPassed) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        btn.setAttribute('aria-label', `${formatDisplayTime(slot)}, Passed`);
        statusSpan.textContent = 'Passed';
      } else {
        statusSpan.textContent = 'Available';
        btn.setAttribute('aria-label', `${formatDisplayTime(slot)}, Available`);

        if (state.selectedTime === slot) {
          btn.classList.add('selected');
          btn.setAttribute('aria-checked', 'true');
        }

        btn.addEventListener('click', () => selectSlot(slot));
      }

      btn.appendChild(timeSpan);
      btn.appendChild(statusSpan);
      elements.slotsContainer.appendChild(btn);
    });

    if (availableCount === 0) {
      elements.slotsContainer.hidden = true;
      elements.slotsStatus.hidden = false;
      elements.slotsStatus.textContent = isToday
        ? 'No remaining time slots for today. Please pick another date.'
        : 'All time slots for this date are booked. Please pick another date.';
      elements.selectedSlotPill.hidden = true;
      elements.selectedTimeInput.value = '';
      state.selectedTime = '';
    }
  }

  function selectSlot(timeStr) {
    state.selectedTime = timeStr;
    elements.selectedTimeInput.value = timeStr;
    setFieldError(null, elements.timeError, '');

    const allBtns = elements.slotsContainer.querySelectorAll('.slot-btn');
    allBtns.forEach(btn => {
      if (btn.dataset.time === timeStr) {
        btn.classList.add('selected');
        btn.setAttribute('aria-checked', 'true');
      } else {
        btn.classList.remove('selected');
        btn.setAttribute('aria-checked', 'false');
      }
    });

    const dateStr = elements.date.value;
    elements.selectedSlotText.textContent = `${formatDisplayDate(dateStr)} at ${formatDisplayTime(timeStr)}`;
    elements.selectedSlotPill.hidden = false;

    announce(`Selected slot: ${formatDisplayTime(timeStr)} on ${formatDisplayDate(dateStr)}`);
    pushHistoryState();
  }

  // ---------------------------------------------------------------------------
  // Appointments List Rendering
  // ---------------------------------------------------------------------------
  function renderAppointmentsList() {
    const list = state.appointments;
    const now = new Date();
    const todayStr = getTodayString();

    const upcomingList = list
      .filter(a => {
        if (a.status !== 'booked') return false;
        if (a.date > todayStr) return true;
        if (a.date === todayStr) {
          const [h, m] = a.startTime.split(':').map(Number);
          const slotEnd = new Date();
          slotEnd.setHours(h, m + SCHEDULE_CONFIG.slotDurationMinutes, 0, 0);
          return slotEnd >= now;
        }
        return false;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startTime.localeCompare(b.startTime);
      });

    const allList = [...list].sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.startTime.localeCompare(a.startTime);
    });

    elements.countUpcoming.textContent = upcomingList.length;
    elements.countAll.textContent = allList.length;

    if (upcomingList.length > 0) {
      elements.navBadge.textContent = upcomingList.length;
      elements.navBadge.hidden = false;
    } else {
      elements.navBadge.hidden = true;
    }

    const currentList = state.currentTab === 'upcoming' ? upcomingList : allList;
    elements.appointmentsList.innerHTML = '';

    if (currentList.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';

      const title = document.createElement('h3');
      title.className = 'empty-title';
      title.textContent = state.currentTab === 'upcoming'
        ? 'No Upcoming Appointments'
        : 'No Appointment History';

      const desc = document.createElement('p');
      desc.className = 'empty-desc';
      desc.textContent = state.currentTab === 'upcoming'
        ? 'You do not have any active appointments.'
        : 'No previous or active appointments recorded.';

      const ctaBtn = document.createElement('button');
      ctaBtn.type = 'button';
      ctaBtn.className = 'btn btn-primary btn-sm';
      ctaBtn.textContent = 'Book an Appointment';
      ctaBtn.addEventListener('click', () => {
        switchPage('book');
        elements.fullName.focus();
      });

      emptyDiv.appendChild(title);
      emptyDiv.appendChild(desc);
      emptyDiv.appendChild(ctaBtn);

      elements.appointmentsList.appendChild(emptyDiv);
      return;
    }

    currentList.forEach(appt => {
      const card = document.createElement('article');
      card.className = 'appointment-card' + (appt.status === 'cancelled' ? ' is-cancelled' : '');
      card.dataset.id = appt.id;

      const cardTop = document.createElement('div');
      cardTop.className = 'card-top';

      const refPill = document.createElement('div');
      refPill.className = 'reference-pill';
      refPill.textContent = appt.reference;

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn-copy-ref';
      copyBtn.setAttribute('title', 'Copy reference code');
      copyBtn.setAttribute('aria-label', `Copy reference ${appt.reference}`);
      copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(appt.reference);
        copyBtn.setAttribute('title', 'Copied!');
        announce(`Reference ${appt.reference} copied to clipboard`);
        setTimeout(() => copyBtn.setAttribute('title', 'Copy reference code'), 2000);
      });
      refPill.appendChild(copyBtn);

      const statusBadge = document.createElement('span');
      statusBadge.className = `status-badge ${appt.status}`;
      statusBadge.textContent = appt.status === 'booked' ? 'Confirmed' : 'Cancelled';

      cardTop.appendChild(refPill);
      cardTop.appendChild(statusBadge);

      if (appt.appointmentType) {
        const typeBadge = document.createElement('span');
        typeBadge.className = 'appointment-type-tag';
        typeBadge.textContent = appt.appointmentType;
        cardTop.appendChild(typeBadge);
      }

      const cardMain = document.createElement('div');
      cardMain.className = 'card-main-info';

      const datetimeHeading = document.createElement('h3');
      datetimeHeading.className = 'card-datetime';
      const endTime = getSlotEndTime(appt.startTime);
      datetimeHeading.textContent = `${formatDisplayDate(appt.date)}: ${formatDisplayTime(appt.startTime)} - ${formatDisplayTime(endTime)}`;

      const metaList = document.createElement('div');
      metaList.className = 'card-meta-list';

      const typeRow = document.createElement('div');
      typeRow.className = 'meta-row';
      typeRow.innerHTML = `<span class="meta-label">Type:</span> <strong></strong>`;
      typeRow.querySelector('strong').textContent = appt.appointmentType || 'General';

      const nameRow = document.createElement('div');
      nameRow.className = 'meta-row';
      nameRow.innerHTML = `<span class="meta-label">Name:</span> <strong></strong>`;
      nameRow.querySelector('strong').textContent = appt.fullName;

      const emailRow = document.createElement('div');
      emailRow.className = 'meta-row';
      emailRow.innerHTML = `<span class="meta-label">Email:</span> <span></span>`;
      emailRow.querySelector('span:last-child').textContent = appt.email;

      const phoneRow = document.createElement('div');
      phoneRow.className = 'meta-row';
      phoneRow.innerHTML = `<span class="meta-label">Phone:</span> <span></span>`;
      phoneRow.querySelector('span:last-child').textContent = maskPhone(appt.phone);

      metaList.appendChild(typeRow);
      metaList.appendChild(nameRow);
      metaList.appendChild(emailRow);
      metaList.appendChild(phoneRow);

      if (appt.notes && appt.notes.trim()) {
        const notesDiv = document.createElement('div');
        notesDiv.className = 'meta-notes';
        notesDiv.textContent = appt.notes;
        metaList.appendChild(notesDiv);
      }

      cardMain.appendChild(datetimeHeading);
      cardMain.appendChild(metaList);

      card.appendChild(cardTop);
      card.appendChild(cardMain);

      if (appt.status === 'booked') {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'card-bottom-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn-cancel-appt';
        cancelBtn.textContent = 'Cancel Appointment';
        cancelBtn.setAttribute('aria-label', `Cancel appointment on ${formatDisplayDate(appt.date)} at ${formatDisplayTime(appt.startTime)}`);
        cancelBtn.addEventListener('click', () => openCancelModal(appt));

        actionsDiv.appendChild(cancelBtn);
        card.appendChild(actionsDiv);
      }

      elements.appointmentsList.appendChild(card);
    });
  }

  // ---------------------------------------------------------------------------
  // Notification Center & Floating Box Manager (Top Right)
  // ---------------------------------------------------------------------------
  const notificationState = {
    items: [],
    isOpen: false
  };

  function updateNotificationBadge() {
    const count = notificationState.items.length;
    if (elements.notificationNumberBadge) {
      if (count > 0) {
        elements.notificationNumberBadge.textContent = String(count);
        elements.notificationNumberBadge.hidden = false;
        if (elements.btnNotificationBox) {
          elements.btnNotificationBox.classList.add('has-unread');
        }
      } else {
        elements.notificationNumberBadge.textContent = '0';
        elements.notificationNumberBadge.hidden = true;
        if (elements.btnNotificationBox) {
          elements.btnNotificationBox.classList.remove('has-unread');
        }
      }
    }

    if (elements.floatingUnreadCount) {
      if (count > 0) {
        elements.floatingUnreadCount.textContent = `${count} New`;
        elements.floatingUnreadCount.hidden = false;
      } else {
        elements.floatingUnreadCount.hidden = true;
      }
    }

    if (elements.btnClearAllNotifications) {
      elements.btnClearAllNotifications.hidden = count === 0;
    }
  }

  function renderNotificationsList() {
    updateNotificationBadge();
    if (!elements.notificationItemsList) return;

    elements.notificationItemsList.innerHTML = '';

    if (notificationState.items.length === 0) {
      if (elements.notificationEmptyState) {
        elements.notificationEmptyState.hidden = false;
      }
      return;
    }

    if (elements.notificationEmptyState) {
      elements.notificationEmptyState.hidden = true;
    }

    notificationState.items.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = `notification-item type-${item.type || 'info'}`;
      itemEl.setAttribute('data-id', item.id);

      // Header with Title, Type Highlight & 'x' Dismiss
      const headerRow = document.createElement('div');
      headerRow.className = 'notification-item-header';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'notification-title-group';

      if (item.appointmentType) {
        const typeBadge = document.createElement('span');
        typeBadge.className = 'notification-type-tag';
        typeBadge.textContent = item.appointmentType;
        titleGroup.appendChild(typeBadge);
      }

      const titleEl = document.createElement('h4');
      titleEl.className = 'notification-item-title';
      titleEl.textContent = item.title;
      titleGroup.appendChild(titleEl);

      const dismissBtn = document.createElement('button');
      dismissBtn.type = 'button';
      dismissBtn.className = 'btn-dismiss-item';
      dismissBtn.setAttribute('aria-label', `Dismiss ${item.title}`);
      dismissBtn.innerHTML = '&times;';
      dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeNotification(item.id);
      });

      headerRow.appendChild(titleGroup);
      headerRow.appendChild(dismissBtn);

      // Message
      const msgEl = document.createElement('p');
      msgEl.className = 'notification-item-message';
      msgEl.innerHTML = item.message;

      // Footer with time & action
      const footerRow = document.createElement('div');
      footerRow.className = 'notification-item-footer';

      const timeEl = document.createElement('span');
      timeEl.className = 'notification-item-time';
      timeEl.textContent = item.time;
      footerRow.appendChild(timeEl);

      if (item.actionText && item.onAction) {
        const actionBtn = document.createElement('button');
        actionBtn.type = 'button';
        actionBtn.className = 'notification-action-btn';
        actionBtn.textContent = item.actionText;
        actionBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeNotificationBox();
          item.onAction();
        });
        footerRow.appendChild(actionBtn);
      }

      itemEl.appendChild(headerRow);
      itemEl.appendChild(msgEl);
      itemEl.appendChild(footerRow);

      elements.notificationItemsList.appendChild(itemEl);
    });
  }

  function addNotification({ type = 'info', title, message, appointmentType = null, actionText = null, onAction = null }) {
    const id = 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    const now = new Date();
    const timeStr = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });

    notificationState.items.unshift({
      id,
      type,
      title,
      message,
      appointmentType,
      time: timeStr,
      actionText,
      onAction
    });

    if (notificationState.items.length > 15) {
      notificationState.items.pop();
    }

    renderNotificationsList();
    announce(`New notification: ${title}${appointmentType ? ' - ' + appointmentType : ''}`);
  }

  function removeNotification(id) {
    notificationState.items = notificationState.items.filter(item => item.id !== id);
    renderNotificationsList();
  }

  function clearAllNotifications() {
    notificationState.items = [];
    renderNotificationsList();
    announce('All notifications cleared.');
  }

  function toggleNotificationBox() {
    if (notificationState.isOpen) {
      closeNotificationBox();
    } else {
      openNotificationBox();
    }
  }

  function openNotificationBox() {
    notificationState.isOpen = true;
    if (elements.notificationFloatingBox) {
      elements.notificationFloatingBox.hidden = false;
      renderNotificationsList();
      if (elements.notificationFloatingContent) {
        elements.notificationFloatingContent.focus();
      }
    }
    if (elements.btnNotificationBox) {
      elements.btnNotificationBox.setAttribute('aria-expanded', 'true');
    }
  }

  function closeNotificationBox() {
    notificationState.isOpen = false;
    if (elements.notificationFloatingBox) {
      elements.notificationFloatingBox.hidden = true;
    }
    if (elements.btnNotificationBox) {
      elements.btnNotificationBox.setAttribute('aria-expanded', 'false');
    }
  }

  function syncUpcomingNotifications() {
    const todayStr = getTodayString();
    const active = state.appointments.filter(a => a.status === 'booked' && a.date >= todayStr);
    if (elements.navBadge) {
      elements.navBadge.textContent = String(active.length);
      elements.navBadge.hidden = active.length === 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Alert Banner & Notification Helpers
  // ---------------------------------------------------------------------------
  function showAlert(type, title, message, actionBtn = null, appointmentType = null) {
    if (elements.banner) {
      elements.banner.className = `alert-banner ${type}`;
      elements.alertTitle.textContent = title;
      elements.alertMessage.innerHTML = '';

      if (appointmentType) {
        const typeBadge = document.createElement('span');
        typeBadge.className = 'banner-type-badge';
        typeBadge.textContent = `Type: ${appointmentType}`;
        elements.alertMessage.appendChild(typeBadge);
      }
      
      const msgSpan = document.createElement('span');
      msgSpan.innerHTML = message;
      elements.alertMessage.appendChild(msgSpan);

      if (actionBtn) {
        elements.alertMessage.appendChild(document.createElement('br'));
        elements.alertMessage.appendChild(actionBtn);
      }

      elements.banner.hidden = false;
      elements.banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Mirror to top-right notification box
    let actionText = null;
    let onAction = null;
    if (type === 'success' && title === 'Booking Confirmed') {
      actionText = 'View in My Appointments';
      onAction = () => switchPage('appointments');
    }

    addNotification({
      type,
      title,
      message,
      appointmentType,
      actionText,
      onAction
    });

    announce(`${title}: ${message}`);
  }

  function hideAlert() {
    if (elements.banner) {
      elements.banner.hidden = true;
      elements.alertTitle.textContent = '';
      elements.alertMessage.textContent = '';
    }
  }

  // ---------------------------------------------------------------------------
  // Create Booking Submission
  // ---------------------------------------------------------------------------
  async function handleBookingSubmit(e) {
    e.preventDefault();

    if (state.isSubmitting) return;

    hideAlert();

    const fullNameVal = elements.fullName.value;
    const emailVal = elements.email.value;
    const phoneVal = elements.phone.value;
    const dateVal = elements.date.value;
    const rawTypeVal = elements.appointmentType ? elements.appointmentType.value : '';
    const customTypeVal = elements.customType ? elements.customType.value : '';
    const timeVal = elements.selectedTimeInput.value;
    const notesVal = elements.notes.value;

    const nameErr = validateFullName(fullNameVal);
    const emailErr = validateEmail(emailVal);
    const phoneErr = validatePhone(phoneVal);
    const dateErr = validateDate(dateVal);
    const typeErr = validateAppointmentType(rawTypeVal, customTypeVal);
    const timeErr = validateTime(timeVal, dateVal);

    setFieldError(elements.fullName, elements.nameError, nameErr);
    setFieldError(elements.email, elements.emailError, emailErr);
    setFieldError(elements.phone, elements.phoneError, phoneErr);
    setFieldError(elements.date, elements.dateError, dateErr);
    setFieldError(elements.appointmentType, elements.typeError, typeErr);
    if (rawTypeVal === 'Others' && typeErr) {
      setFieldError(elements.customType, elements.customTypeError, typeErr);
    } else {
      setFieldError(elements.customType, elements.customTypeError, '');
    }
    setFieldError(null, elements.timeError, timeErr);

    if (nameErr) {
      elements.fullName.focus();
      return;
    }
    if (emailErr) {
      elements.email.focus();
      return;
    }
    if (phoneErr) {
      elements.phone.focus();
      return;
    }
    if (dateErr) {
      elements.date.focus();
      return;
    }
    if (typeErr) {
      if (rawTypeVal === 'Others' && elements.customType) {
        elements.customType.focus();
      } else if (elements.appointmentType) {
        elements.appointmentType.focus();
      }
      return;
    }
    if (timeErr) {
      elements.slotsContainer.focus();
      return;
    }

    state.isSubmitting = true;
    elements.submitBtn.disabled = true;
    elements.submitSpinner.hidden = false;
    elements.submitText.textContent = 'Saving Booking...';

    const effectiveType = getEffectiveAppointmentType();

    const payload = {
      fullName: fullNameVal.trim(),
      email: emailVal.trim(),
      phone: phoneVal.trim(),
      date: dateVal.trim(),
      startTime: timeVal.trim(),
      appointmentType: effectiveType,
      notes: notesVal ? notesVal.trim() : ''
    };

    try {
      const created = await StorageService.createBooking(payload);
      state.appointments = await StorageService.fetchAppointments();

      elements.selectedTimeInput.value = '';
      state.selectedTime = '';
      elements.selectedSlotPill.hidden = true;
      elements.notes.value = '';
      elements.notesCounter.textContent = '0 / 300';

      const finalType = created.appointmentType || effectiveType;

      renderTimeSlots();
      renderAppointmentsList();

      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'btn btn-secondary btn-sm';
      viewBtn.textContent = 'View in My Appointments';
      viewBtn.style.marginTop = '0.65rem';
      viewBtn.addEventListener('click', () => switchPage('appointments'));

      showAlert(
        'success',
        'Booking Confirmed',
        `Your <strong class="notification-type-highlight">${finalType}</strong> appointment is booked for ${formatDisplayDate(created.date)} at ${formatDisplayTime(created.startTime)}. Reference: ${created.reference}.`,
        viewBtn,
        finalType
      );

      announce(`Appointment booked successfully for ${finalType}. Reference code: ${created.reference}`);

    } catch (err) {
      if (err.isConflict) {
        try {
          state.appointments = await StorageService.fetchAppointments();
          renderTimeSlots();
          renderAppointmentsList();
        } catch (ignored) {}

        showAlert(
          'error',
          'Slot Conflict',
          'This slot was just booked by another user. Please choose another time.'
        );
      } else if (err.fieldErrors) {
        if (err.fieldErrors.fullName) setFieldError(elements.fullName, elements.nameError, err.fieldErrors.fullName);
        if (err.fieldErrors.email) setFieldError(elements.email, elements.emailError, err.fieldErrors.email);
        if (err.fieldErrors.phone) setFieldError(elements.phone, elements.phoneError, err.fieldErrors.phone);
        if (err.fieldErrors.date) setFieldError(elements.date, elements.dateError, err.fieldErrors.date);
        if (err.fieldErrors.startTime) setFieldError(null, elements.timeError, err.fieldErrors.startTime);

        showAlert('error', 'Validation Error', 'Please correct the highlighted fields.');
      } else {
        showAlert('error', 'Submission Failed', err.message || 'Unable to save appointment. Please try again.');
      }
    } finally {
      state.isSubmitting = false;
      elements.submitBtn.disabled = false;
      elements.submitSpinner.hidden = true;
      elements.submitText.textContent = 'Confirm Booking';
    }
  }

  // ---------------------------------------------------------------------------
  // Cancellation Modal Flow
  // ---------------------------------------------------------------------------
  let previousActiveElement = null;

  function openCancelModal(appt) {
    state.cancellingAppointment = appt;
    previousActiveElement = document.activeElement;

    elements.modalRef.textContent = appt.reference;
    elements.modalDatetime.textContent = `${formatDisplayDate(appt.date)} at ${formatDisplayTime(appt.startTime)}`;
    elements.modalName.textContent = appt.fullName;
    elements.modalError.hidden = true;
    elements.modalError.textContent = '';
    elements.modalConfirmBtn.disabled = false;
    elements.modalSpinner.hidden = true;

    if (typeof elements.cancelDialog.showModal === 'function') {
      elements.cancelDialog.showModal();
    } else {
      elements.cancelDialog.setAttribute('open', '');
    }

    elements.modalKeepBtn.focus();
    announce(`Cancellation dialog opened for reference ${appt.reference}`);
  }

  function closeCancelModal() {
    state.cancellingAppointment = null;
    if (typeof elements.cancelDialog.close === 'function') {
      elements.cancelDialog.close();
    } else {
      elements.cancelDialog.removeAttribute('open');
    }
    if (previousActiveElement) {
      previousActiveElement.focus();
    }
  }

  async function handleConfirmCancel() {
    if (!state.cancellingAppointment) return;

    const appt = state.cancellingAppointment;
    elements.modalConfirmBtn.disabled = true;
    elements.modalSpinner.hidden = false;
    elements.modalError.hidden = true;

    try {
      await StorageService.cancelBooking(appt.id);
      state.appointments = await StorageService.fetchAppointments();
      renderAppointmentsList();
      renderTimeSlots();

      closeCancelModal();

      showAlert(
        'success',
        'Appointment Cancelled',
        `Appointment (${appt.reference}) on ${formatDisplayDate(appt.date)} has been cancelled.`
      );
      announce(`Appointment ${appt.reference} cancelled successfully.`);

    } catch (err) {
      elements.modalError.textContent = err.message || 'Failed to cancel appointment. Please try again.';
      elements.modalError.hidden = false;
      elements.modalConfirmBtn.disabled = false;
      elements.modalSpinner.hidden = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Form History & Undo System
  // ---------------------------------------------------------------------------
  const formHistory = [];
  let isUndoing = false;

  function captureCurrentFormState() {
    return {
      fullName: elements.fullName ? elements.fullName.value : '',
      email: elements.email ? elements.email.value : '',
      phone: elements.phone ? elements.phone.value : '',
      date: elements.date ? elements.date.value : '',
      appointmentType: elements.appointmentType ? elements.appointmentType.value : '',
      customType: elements.customType ? elements.customType.value : '',
      selectedTime: state.selectedTime || '',
      notes: elements.notes ? elements.notes.value : ''
    };
  }

  function pushHistoryState() {
    if (isUndoing) return;
    const current = captureCurrentFormState();
    if (formHistory.length > 0) {
      const prev = formHistory[formHistory.length - 1];
      if (
        prev.fullName === current.fullName &&
        prev.email === current.email &&
        prev.phone === current.phone &&
        prev.date === current.date &&
        prev.appointmentType === current.appointmentType &&
        prev.customType === current.customType &&
        prev.selectedTime === current.selectedTime &&
        prev.notes === current.notes
      ) {
        return;
      }
    }
    formHistory.push(current);
    updateUndoButtonState();
  }

  function updateUndoButtonState() {
    const canUndo = formHistory.length > 1;
    if (elements.btnUndoStep) {
      elements.btnUndoStep.disabled = !canUndo;
      elements.btnUndoStep.setAttribute('aria-disabled', String(!canUndo));
    }
    if (elements.btnFormUndo) {
      elements.btnFormUndo.disabled = !canUndo;
      elements.btnFormUndo.setAttribute('aria-disabled', String(!canUndo));
    }
  }

  function undoLastStep() {
    if (formHistory.length <= 1) {
      announce('No previous changes to undo.');
      return false;
    }

    isUndoing = true;
    // Discard current state
    formHistory.pop();
    // Retrieve previous state
    const prev = formHistory[formHistory.length - 1];

    if (prev) {
      if (elements.fullName) elements.fullName.value = prev.fullName;
      if (elements.email) elements.email.value = prev.email;
      if (elements.phone) elements.phone.value = prev.phone;
      if (elements.notes) {
        elements.notes.value = prev.notes;
        if (elements.notesCounter) {
          elements.notesCounter.textContent = `${prev.notes.length} / 300`;
        }
      }

      if (elements.appointmentType) {
        elements.appointmentType.value = prev.appointmentType || '';
        if (elements.appointmentType.value === 'Others') {
          if (elements.customTypeGroup) elements.customTypeGroup.hidden = false;
          if (elements.customType) elements.customType.value = prev.customType || '';
        } else {
          if (elements.customTypeGroup) elements.customTypeGroup.hidden = true;
          if (elements.customType) elements.customType.value = '';
        }
      }

      const dateChanged = elements.date && elements.date.value !== prev.date;
      if (elements.date) elements.date.value = prev.date;

      if (dateChanged) {
        renderTimeSlots();
      }

      state.selectedTime = prev.selectedTime || '';
      if (elements.selectedTimeInput) {
        elements.selectedTimeInput.value = prev.selectedTime || '';
      }

      if (elements.slotsContainer) {
        const allBtns = elements.slotsContainer.querySelectorAll('.slot-btn');
        allBtns.forEach(btn => {
          if (btn.dataset.time === state.selectedTime) {
            btn.classList.add('selected');
            btn.setAttribute('aria-checked', 'true');
          } else {
            btn.classList.remove('selected');
            btn.setAttribute('aria-checked', 'false');
          }
        });
      }

      if (state.selectedTime && elements.date.value) {
        elements.selectedSlotText.textContent = `${formatDisplayDate(elements.date.value)} at ${formatDisplayTime(state.selectedTime)}`;
        elements.selectedSlotPill.hidden = false;
      } else {
        elements.selectedSlotPill.hidden = true;
        elements.selectedSlotText.textContent = '';
      }

      // Reset error indicators on undo
      setFieldError(elements.fullName, elements.nameError, '');
      setFieldError(elements.email, elements.emailError, '');
      setFieldError(elements.phone, elements.phoneError, '');
      setFieldError(elements.date, elements.dateError, '');
      setFieldError(elements.appointmentType, elements.typeError, '');
      setFieldError(elements.customType, elements.customTypeError, '');
      setFieldError(null, elements.timeError, '');

      announce('Reverted one step backwards.');
    }

    isUndoing = false;
    updateUndoButtonState();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Event Listeners Setup
  // ---------------------------------------------------------------------------
  function setupEventListeners() {
    elements.date.min = getTodayString();

    // Page view navigation
    elements.navBook.addEventListener('click', () => switchPage('book'));
    elements.navAppointments.addEventListener('click', () => switchPage('appointments'));
    if (elements.brandLink) {
      elements.brandLink.addEventListener('click', (e) => {
        e.preventDefault();
        switchPage('book');
      });
    }
    if (elements.btnBackToBooking) {
      elements.btnBackToBooking.addEventListener('click', () => switchPage('book'));
    }

    // Back / Undo step handlers
    if (elements.btnUndoStep) {
      elements.btnUndoStep.addEventListener('click', undoLastStep);
    }
    if (elements.btnFormUndo) {
      elements.btnFormUndo.addEventListener('click', undoLastStep);
    }

    // Hash change routing
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash;
      if (hash === '#appointments') {
        switchPage('appointments');
      } else {
        switchPage('book');
      }
    });

    elements.notes.addEventListener('input', () => {
      const len = elements.notes.value.length;
      elements.notesCounter.textContent = `${len} / 300`;
    });

    elements.date.addEventListener('change', () => {
      const err = validateDate(elements.date.value);
      setFieldError(elements.date, elements.dateError, err);
      renderTimeSlots();
      pushHistoryState();
    });

    if (elements.appointmentType) {
      elements.appointmentType.addEventListener('change', () => {
        const selected = elements.appointmentType.value;
        if (selected === 'Others') {
          if (elements.customTypeGroup) elements.customTypeGroup.hidden = false;
          if (elements.customType) elements.customType.focus();
        } else {
          if (elements.customTypeGroup) elements.customTypeGroup.hidden = true;
          if (elements.customType) elements.customType.value = '';
          setFieldError(elements.customType, elements.customTypeError, '');
        }
        const customVal = elements.customType ? elements.customType.value : '';
        const err = validateAppointmentType(selected, customVal);
        setFieldError(elements.appointmentType, elements.typeError, err);
        pushHistoryState();
      });
    }

    if (elements.customType) {
      elements.customType.addEventListener('input', () => {
        if (elements.appointmentType && elements.appointmentType.value === 'Others') {
          const err = validateAppointmentType('Others', elements.customType.value);
          setFieldError(elements.customType, elements.customTypeError, err);
        }
      });

      elements.customType.addEventListener('blur', () => {
        if (elements.appointmentType && elements.appointmentType.value === 'Others') {
          const err = validateAppointmentType('Others', elements.customType.value);
          setFieldError(elements.customType, elements.customTypeError, err);
        }
        pushHistoryState();
      });
    }

    // Capture input history snapshots on change / blur
    elements.fullName.addEventListener('blur', () => {
      const err = validateFullName(elements.fullName.value);
      setFieldError(elements.fullName, elements.nameError, err);
      pushHistoryState();
    });

    elements.email.addEventListener('blur', () => {
      const err = validateEmail(elements.email.value);
      setFieldError(elements.email, elements.emailError, err);
      pushHistoryState();
    });

    // Default Indian phone prefix (+91) management
    elements.phone.addEventListener('focus', () => {
      if (!elements.phone.value || elements.phone.value.trim() === '') {
        elements.phone.value = '+91 ';
      }
    });

    elements.phone.addEventListener('blur', () => {
      const err = validatePhone(elements.phone.value);
      setFieldError(elements.phone, elements.phoneError, err);
      pushHistoryState();
    });

    elements.notes.addEventListener('blur', () => {
      pushHistoryState();
    });

    // Catch-all change event on form
    elements.form.addEventListener('change', () => {
      pushHistoryState();
    });

    elements.form.addEventListener('submit', handleBookingSubmit);
    elements.btnCloseBanner.addEventListener('click', hideAlert);

    elements.tabUpcoming.addEventListener('click', () => {
      state.currentTab = 'upcoming';
      elements.tabUpcoming.classList.add('active');
      elements.tabUpcoming.setAttribute('aria-selected', 'true');
      elements.tabAll.classList.remove('active');
      elements.tabAll.setAttribute('aria-selected', 'false');
      renderAppointmentsList();
    });

    elements.tabAll.addEventListener('click', () => {
      state.currentTab = 'all';
      elements.tabAll.classList.add('active');
      elements.tabAll.setAttribute('aria-selected', 'true');
      elements.tabUpcoming.classList.remove('active');
      elements.tabUpcoming.setAttribute('aria-selected', 'false');
      renderAppointmentsList();
    });

    elements.btnRefresh.addEventListener('click', async () => {
      elements.btnRefresh.disabled = true;
      try {
        state.appointments = await StorageService.fetchAppointments();
        renderAppointmentsList();
        renderTimeSlots();
        announce('Appointment list refreshed.');
      } catch (err) {
        showAlert('error', 'Refresh Failed', err.message);
      } finally {
        elements.btnRefresh.disabled = false;
      }
    });

    elements.modalKeepBtn.addEventListener('click', closeCancelModal);
    elements.modalConfirmBtn.addEventListener('click', handleConfirmCancel);

    elements.cancelDialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCancelModal();
      }
    });

    // Notification Box Toggle & Close Handlers (Top Right)
    if (elements.btnNotificationBox) {
      elements.btnNotificationBox.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleNotificationBox();
      });
    }

    if (elements.btnCloseFloatingBox) {
      elements.btnCloseFloatingBox.addEventListener('click', (e) => {
        e.stopPropagation();
        closeNotificationBox();
      });
    }

    if (elements.btnClearAllNotifications) {
      elements.btnClearAllNotifications.addEventListener('click', (e) => {
        e.stopPropagation();
        clearAllNotifications();
      });
    }

    // Dismiss floating box when clicking outside
    document.addEventListener('click', (e) => {
      if (notificationState.isOpen && elements.notificationWrapper) {
        if (!elements.notificationWrapper.contains(e.target)) {
          closeNotificationBox();
        }
      }
    });

    // Dismiss floating box on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && notificationState.isOpen) {
        closeNotificationBox();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Cinematic Intro Animation Lifecycle Coordinator: 4 Seamless Vertical Splits
  // Alternating Wave: 1 UP, 2 DOWN, 3 UP, 4 DOWN (with overlapping triggers)
  // ---------------------------------------------------------------------------
  const intro = {
    overlay: document.getElementById('cinematic-intro'),
    splitCols: [
      document.getElementById('split-col-1'),
      document.getElementById('split-col-2'),
      document.getElementById('split-col-3'),
      document.getElementById('split-col-4')
    ],
    homepageRoot: document.getElementById('homepage-root'),
    completed: false
  };

  function endCinematicIntro() {
    if (intro.completed) return;
    intro.completed = true;

    // Restore body scrolling
    document.body.style.overflow = '';

    if (intro.overlay) {
      intro.overlay.classList.add('intro-fading');
      setTimeout(() => {
        if (intro.overlay) {
          intro.overlay.classList.add('intro-hidden');
          intro.overlay.setAttribute('aria-hidden', 'true');
        }
      }, 400);
    }
  }

  function startCinematicIntro() {
    if (!intro.overlay) return;

    // Accessibility check: reduced motion preference
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      endCinematicIntro();
      return;
    }

    // Lock page scrolling while intro is running
    document.body.style.overflow = 'hidden';

    // Reduced timing: brief hold, then overlapping alternating wave
    // Col 1 goes UP (takes 700ms)
    // Before Col 1 disappears, Col 2 starts going DOWN (+280ms)
    // Before Col 2 disappears, Col 3 starts going UP (+280ms)
    // Before Col 3 disappears, Col 4 starts going DOWN (+280ms)
    const holdDuration = 600;
    const staggerGap = 280;

    setTimeout(() => {
      if (intro.completed) return;
      // Part 1: UP
      if (intro.splitCols[0]) intro.splitCols[0].classList.add('col-slide-up');

      setTimeout(() => {
        if (intro.completed) return;
        // Part 2: DOWN (starts before Part 1 disappears)
        if (intro.splitCols[1]) intro.splitCols[1].classList.add('col-slide-down');

        setTimeout(() => {
          if (intro.completed) return;
          // Part 3: UP (starts before Part 2 disappears)
          if (intro.splitCols[2]) intro.splitCols[2].classList.add('col-slide-up');

          setTimeout(() => {
            if (intro.completed) return;
            // Part 4: DOWN (starts before Part 3 disappears)
            if (intro.splitCols[3]) intro.splitCols[3].classList.add('col-slide-down');

            // Once the final column slides off completely (700ms + margin), complete intro
            setTimeout(() => {
              endCinematicIntro();
            }, 750);

          }, staggerGap);

        }, staggerGap);

      }, staggerGap);

    }, holdDuration);
  }

  // ---------------------------------------------------------------------------
  // Application Bootstrap
  // ---------------------------------------------------------------------------
  async function init() {
    // Start cinematic opening intro immediately (runs once per page load)
    startCinematicIntro();

    setupEventListeners();
    await StorageService.init();

    try {
      state.appointments = await StorageService.fetchAppointments();
    } catch (err) {
      console.error('Error fetching appointments:', err);
      state.appointments = [];
    }

    // Default route
    if (window.location.hash === '#appointments') {
      switchPage('appointments');
    } else {
      switchPage('book');
    }

    // Default Indian phone prefix if not already set
    if (elements.phone && (!elements.phone.value || elements.phone.value.trim() === '')) {
      elements.phone.value = '+91 ';
    }

    const today = new Date();
    if (today.getDay() === 0) {
      today.setDate(today.getDate() + 1);
    }
    const defaultDateStr = today.toISOString().split('T')[0];
    elements.date.value = defaultDateStr;
    renderTimeSlots();

    // Push initial baseline form snapshot for undo
    pushHistoryState();
    updateUndoButtonState();

    // Initialize notification center display
    syncUpcomingNotifications();
    renderNotificationsList();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for testing
  window.BookMyTime = {
    state,
    SCHEDULE_CONFIG,
    validateFullName,
    validateEmail,
    validatePhone,
    validateDate,
    validateTime,
    validateAppointmentType,
    getEffectiveAppointmentType,
    generateConfigSlots,
    StorageService,
    renderTimeSlots,
    renderAppointmentsList,
    openCancelModal,
    switchPage,
    startCinematicIntro,
    endCinematicIntro,
    undoLastStep,
    pushHistoryState,
    formHistory,
    addNotification,
    removeNotification,
    clearAllNotifications,
    notificationState,
    openNotificationBox,
    closeNotificationBox,
    toggleNotificationBox
  };
  window.BookEase = window.BookMyTime;

})();
