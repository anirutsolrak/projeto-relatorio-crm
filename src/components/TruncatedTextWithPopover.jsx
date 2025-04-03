import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';

function TruncatedTextWithPopover({ children, className, title }) {
    const [showPopover, setShowPopover] = useState(false);
    const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
    const [isTruncated, setIsTruncated] = useState(false);

    const textRef = useRef(null);
    const popoverRef = useRef(null);

    const checkTruncation = useCallback(() => {
      const element = textRef.current;
      if (element) {
        const currentlyTruncated = element.scrollWidth > element.clientWidth + 1;
        if (currentlyTruncated !== isTruncated) {
          setIsTruncated(currentlyTruncated);
          if (!currentlyTruncated && showPopover) {
              setShowPopover(false);
          }
        }
      }
    }, [isTruncated, showPopover]);

    useEffect(() => {
      checkTruncation();

      const element = textRef.current;
      if (!element) return;

      let observer;
      if (window.ResizeObserver) {
          observer = new ResizeObserver(checkTruncation);
          observer.observe(element);
      } else {
          window.addEventListener('resize', checkTruncation);
      }

      return () => {
          if (observer) {
              observer.disconnect();
          } else {
              window.removeEventListener('resize', checkTruncation);
          }
      };
    }, [children, checkTruncation]);


    const handleClick = (event) => {
      if (!isTruncated) return;

      event.stopPropagation();

      if (showPopover) {
          setShowPopover(false);
      } else {
          const rect = textRef.current.getBoundingClientRect();
          const popoverTop = rect.top - 8;
          const popoverLeft = rect.left + (rect.width / 2);

          setPopoverPosition({ top: popoverTop, left: popoverLeft });
          setShowPopover(true);
      }
    };

    useEffect(() => {
      if (!showPopover) return;

      const handleClickOutside = (event) => {
        if (textRef.current && !textRef.current.contains(event.target) &&
            popoverRef.current && !popoverRef.current.contains(event.target))
        {
          setShowPopover(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [showPopover]);


    const portalContainer = typeof document !== 'undefined' ? document.getElementById('popover-root') : null;

    const textElement = React.createElement('span', {
        ref: textRef,
        className: `truncate-ellipsis ${className || ''} ${isTruncated ? 'is-clickable-truncated' : ''}`,
        onClick: handleClick,
        title: isTruncated ? (typeof children === 'string' ? children : title || 'Clique para ver completo') : undefined,
        role: isTruncated ? 'button' : undefined,
        tabIndex: isTruncated ? 0 : undefined,
        'aria-expanded': isTruncated ? showPopover : undefined,
        'aria-haspopup': isTruncated ? 'tooltip' : undefined
      },
      children
    );

    const popoverElement = showPopover && portalContainer ?
      ReactDOM.createPortal(
        React.createElement('div', {
            ref: popoverRef,
            className: 'popover-via-portal',
            style: {
                top: `${popoverPosition.top}px`,
                left: `${popoverPosition.left}px`,
                transform: 'translate(-50%, -100%)'
            },
            role: 'tooltip'
          },
          children
        ),
        portalContainer
      ) : null;

    return React.createElement(React.Fragment, null, textElement, popoverElement);
  }

export default TruncatedTextWithPopover;