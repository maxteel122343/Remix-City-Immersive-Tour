import * as React from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'gmp-map': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        zoom?: string | number;
        'map-id'?: string;
        center?: any;
      };
      'gmp-advanced-marker': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        position?: any;
        'collision-behavior'?: string;
      };
      'gmp-place-details-compact': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        orientation?: 'horizontal' | 'vertical' | 'HORIZONTAL' | 'VERTICAL';
        'truncation-preferred'?: boolean | string;
        style?: React.CSSProperties;
      };
      'gmp-advanced-place-details-compact': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        orientation?: 'horizontal' | 'vertical' | 'HORIZONTAL' | 'VERTICAL';
        'truncation-preferred'?: boolean | string;
        style?: React.CSSProperties;
      };
      'gmp-place-place-request': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        place?: string | null;
      };
      'gmp-place-details-place-request': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        place?: string | null;
      };
      'gmp-place-content-config': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'gmp-place-name': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'gmp-place-address': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'gmp-place-media': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        'lightbox-preferred'?: boolean | string;
      };
      'gmp-place-rating': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'gmp-place-type': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'gmp-place-price': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'gmp-place-accessible-entrance-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'gmp-place-open-now-status': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'gmp-place-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        slot?: string;
        'action-aria-label'?: string;
        style?: React.CSSProperties;
      };
      'gmp-place-link': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        action?: 'open-website' | 'open-directions' | 'open-map' | 'call' | string;
        target?: string;
        slot?: string;
      };
      'gmp-place-attribution': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        'light-scheme-color'?: string;
        'dark-scheme-color'?: string;
      };
      'gmp-advanced-place-list': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        places?: string[] | string | null;
        orientation?: 'horizontal' | 'vertical' | 'HORIZONTAL' | 'VERTICAL';
        selectable?: boolean | string;
        'truncation-preferred'?: boolean | string;
        style?: React.CSSProperties;
      };
      'gmp-place-standard-content': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'gmp-place-all-content': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'gmp-basic-place-autocomplete': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        slot?: string;
        'included-region-codes'?: string;
        'included-primary-types'?: string;
        placeholder?: string;
        style?: React.CSSProperties;
      };
      'gmp-place-opening-hours': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'gmp-advanced-place-details': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        orientation?: 'horizontal' | 'vertical' | 'HORIZONTAL' | 'VERTICAL';
        'truncation-preferred'?: boolean | string;
        style?: React.CSSProperties;
      };
    };
  }
}
